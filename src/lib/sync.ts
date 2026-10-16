import Dexie from 'dexie'
import { db, type LikedTrack } from './db'
import { NetworkError } from './errors'
import { classifyTrack, type ClassifyDeps, type GenreProfile } from './genres/classify'
import { getArtistTopTags, getTrackTopTags, LastfmError } from './lastfm/client'
import { AuthError } from './spotify/auth'
import { getArtist, getSavedTracks } from './spotify/api'
import { SpotifyApiError } from './spotify/client'
import type { SavedTrack, SpotifyImage, SpotifyTrack } from './spotify/types'

const TRANSIENT_LASTFM_CODES = new Set([0, 29, 11, 16])
// Invalid / suspended API key: every track would fail, so never store 'none' profiles for it.
const FATAL_LASTFM_CODES = new Set([10, 26])
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500

function smallestImageUrl(images: SpotifyImage[] | null | undefined): string | undefined {
  if (!images || images.length === 0) return undefined
  const area = (i: SpotifyImage) => (i.width ?? Infinity) * (i.height ?? Infinity)
  return images.reduce((best, i) => (area(i) < area(best) ? i : best)).url
}

export function computeSyncDiff(
  remote: SavedTrack[],
  localIds: Set<string>,
): { upserts: LikedTrack[]; removedIds: string[] } {
  const upserts = new Map<string, LikedTrack>()
  for (const { added_at, track } of remote) {
    if (track === null || track.is_local || track.id === null) continue
    upserts.set(track.id, {
      id: track.id,
      uri: track.uri,
      name: track.name,
      artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
      albumName: track.album.name,
      releaseDate: track.album.release_date,
      releaseDatePrecision: track.album.release_date_precision,
      addedAt: Date.parse(added_at),
      imageUrl: smallestImageUrl(track.album.images),
    })
  }
  const removedIds = [...localIds].filter((id) => !upserts.has(id))
  return { upserts: [...upserts.values()], removedIds }
}

export async function syncLikedTracks(
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ added: number; removed: number }> {
  const remote = await getSavedTracks(onProgress)
  const localIds = new Set((await db.likedTracks.toCollection().primaryKeys()) as string[])
  const { upserts, removedIds } = computeSyncDiff(remote, localIds)
  if (upserts.length === 0 && localIds.size > 0) {
    // Never wipe the cache because of an empty / unusable response.
    console.warn('Sync: no usable track in the remote response, local cache left untouched.')
    return { added: 0, removed: 0 }
  }
  const added = upserts.filter((t) => !localIds.has(t.id)).length

  await db.transaction('rw', db.likedTracks, db.profiles, db.meta, async () => {
    await db.likedTracks.bulkPut(upserts)
    await db.likedTracks.bulkDelete(removedIds)
    await db.profiles.bulkDelete(removedIds)
    await db.meta.put({ key: 'lastSync', value: Date.now() })
  })
  return { added, removed: removedIds.length }
}

export async function pendingTrackIds(): Promise<string[]> {
  const [liked, profiled] = await Promise.all([
    db.likedTracks.toCollection().primaryKeys() as Promise<string[]>,
    db.profiles.toCollection().primaryKeys() as Promise<string[]>,
  ])
  const done = new Set(profiled)
  return liked.filter((id) => !done.has(id))
}

const toSpotifyTrack = (t: LikedTrack): SpotifyTrack => ({
  id: t.id,
  uri: t.uri,
  name: t.name,
  is_local: false,
  artists: t.artists,
  album: {
    name: t.albumName,
    release_date: t.releaseDate,
    release_date_precision: t.releaseDatePrecision,
    images: [],
  },
})

function isTransient(e: unknown): boolean {
  // Only rejected fetches are transient: a bare TypeError is a bug in our code.
  if (e instanceof NetworkError) return true
  if (e instanceof LastfmError) return TRANSIENT_LASTFM_CODES.has(e.code)
  if (e instanceof SpotifyApiError) return e.status === HTTP_TOO_MANY_REQUESTS || e.status >= HTTP_SERVER_ERROR
  // Plain Error (e.g. token refresh failure); subclasses are handled above.
  return e instanceof Error && e.constructor === Error
}

const realDeps: ClassifyDeps = {
  trackTags: getTrackTopTags,
  artistTags: getArtistTopTags,
  spotifyArtist: getArtist,
  getArtistInfo: (id) => db.artists.get(id),
  saveArtistInfo: async (info) => {
    await db.artists.put(info)
  },
}

/**
 * Analyses pending tracks one by one, saving each profile immediately (resumable).
 * Transient errors leave the track pending (counted in `failed`); other errors store a
 * `none` profile; `AuthError` aborts.
 */
export async function runAnalysis(opts: {
  signal: AbortSignal
  onProgress: (done: number, total: number) => void
  deps?: ClassifyDeps
}): Promise<{ failed: number }> {
  const deps = opts.deps ?? realDeps
  const ids = await pendingTrackIds()
  let done = 0
  let failed = 0
  for (const id of ids) {
    if (opts.signal.aborted) break
    const liked = await db.likedTracks.get(id)
    if (liked) {
      try {
        await putProfileIfStillLiked(await classifyTrack(toSpotifyTrack(liked), deps))
      } catch (e) {
        if (e instanceof AuthError || e instanceof Dexie.DexieError) throw e
        if (e instanceof LastfmError && FATAL_LASTFM_CODES.has(e.code)) throw e
        if (isTransient(e)) failed++
        else {
          if (!(e instanceof LastfmError || e instanceof SpotifyApiError)) {
            console.error(`Analysis failed for track ${id}`, e)
          }
          const none: GenreProfile = { trackId: id, genres: [], source: 'none', rawTags: [], analyzedAt: Date.now() }
          await putProfileIfStillLiked(none)
        }
      }
    }
    opts.onProgress(++done, ids.length)
  }
  return { failed }
}

export async function forceResync(): Promise<void> {
  await db.transaction('rw', db.profiles, db.artists, async () => {
    await db.profiles.clear()
    await db.artists.clear()
  })
}

/** Writes the profile only if the track is still liked (it may be unliked or reset mid-analysis). */
function putProfileIfStillLiked(profile: GenreProfile): Promise<void> {
  return db.transaction('rw', db.likedTracks, db.profiles, async () => {
    if (await db.likedTracks.get(profile.trackId)) await db.profiles.put(profile)
  })
}
