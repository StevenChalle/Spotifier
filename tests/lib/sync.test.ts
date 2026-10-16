import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import type { ClassifyDeps, GenreProfile } from '../../src/lib/genres/classify'
import { NetworkError } from '../../src/lib/errors'
import { LastfmError } from '../../src/lib/lastfm/client'
import { AuthError } from '../../src/lib/spotify/auth'
import { SpotifyApiError } from '../../src/lib/spotify/client'
import type { SavedTrack, SpotifyTrack } from '../../src/lib/spotify/types'

vi.mock('../../src/lib/spotify/api', () => ({ getSavedTracks: vi.fn(), getArtist: vi.fn() }))
vi.mock('../../src/lib/genres/classify', () => ({ classifyTrack: vi.fn() }))

import { classifyTrack } from '../../src/lib/genres/classify'
import { getSavedTracks } from '../../src/lib/spotify/api'
import { computeSyncDiff, forceResync, pendingTrackIds, runAnalysis, syncLikedTracks } from '../../src/lib/sync'

const track = (id: string | null, over: Partial<SpotifyTrack> = {}): SpotifyTrack => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  is_local: false,
  artists: [{ id: `a-${id}`, name: `Artist ${id}` }],
  album: {
    name: 'Album',
    release_date: '1987-05',
    release_date_precision: 'month',
    images: [
      { url: 'big', width: 640, height: 640 },
      { url: 'small', width: 64, height: 64 },
    ],
  },
  ...over,
})
const saved = (t: SpotifyTrack | null): SavedTrack => ({ added_at: '2024-01-02T03:04:05Z', track: t })

const profile = (trackId: string, source: GenreProfile['source'] = 'lastfm-track'): GenreProfile => ({
  trackId,
  genres: [],
  source,
  rawTags: [],
  analyzedAt: 1,
})

const noop = () => {}
const deps = {} as ClassifyDeps
const run = (signal = new AbortController().signal, onProgress: (d: number, t: number) => void = noop) =>
  runAnalysis({ signal, onProgress, deps })

async function seedLiked(ids: string[]) {
  vi.mocked(getSavedTracks).mockResolvedValue(ids.map((id) => saved(track(id))))
  await syncLikedTracks()
}

beforeEach(async () => {
  vi.resetAllMocks()
  await Promise.all([db.likedTracks.clear(), db.profiles.clear(), db.artists.clear(), db.meta.clear()])
  vi.mocked(classifyTrack).mockImplementation(async (t) => profile(t.id ?? t.uri))
})

describe('computeSyncDiff', () => {
  it('skips local and null tracks', () => {
    const { upserts } = computeSyncDiff(
      [saved(null), saved(track('l', { is_local: true })), saved(track(null)), saved(track('ok'))],
      new Set(),
    )
    expect(upserts.map((t) => t.id)).toEqual(['ok'])
    expect(upserts[0]).toMatchObject({ imageUrl: 'small', addedAt: Date.parse('2024-01-02T03:04:05Z') })
  })

  it('handles missing album images', () => {
    const t = track('x')
    t.album.images = []
    expect(computeSyncDiff([saved(t)], new Set()).upserts[0].imageUrl).toBeUndefined()
  })

  it('reports removed ids', () => {
    const { removedIds } = computeSyncDiff([saved(track('a'))], new Set(['a', 'b']))
    expect(removedIds).toEqual(['b'])
  })
})

describe('syncLikedTracks', () => {
  it('deletes profiles of unliked tracks', async () => {
    await seedLiked(['a', 'b'])
    await db.profiles.bulkPut([profile('a'), profile('b')])
    vi.mocked(getSavedTracks).mockResolvedValue([saved(track('a')), saved(track('c'))])
    expect(await syncLikedTracks()).toEqual({ added: 1, removed: 1 })
    expect((await db.likedTracks.toArray()).map((t) => t.id).sort()).toEqual(['a', 'c'])
    expect((await db.profiles.toArray()).map((p) => p.trackId)).toEqual(['a'])
    expect((await db.meta.get('lastSync'))?.value).toEqual(expect.any(Number))
    expect(await pendingTrackIds()).toEqual(['c'])
  })

  it('keeps the cache when the remote yields no usable track', async () => {
    await seedLiked(['a', 'b'])
    await db.profiles.put(profile('a'))
    const lastSync = (await db.meta.get('lastSync'))?.value
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getSavedTracks).mockResolvedValue([saved(null), saved(track('l', { is_local: true }))])
    expect(await syncLikedTracks()).toEqual({ added: 0, removed: 0 })
    expect(await db.likedTracks.count()).toBe(2)
    expect(await db.profiles.count()).toBe(1)
    expect((await db.meta.get('lastSync'))?.value).toBe(lastSync)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still syncs an empty remote when the cache is empty', async () => {
    vi.mocked(getSavedTracks).mockResolvedValue([])
    expect(await syncLikedTracks()).toEqual({ added: 0, removed: 0 })
    expect((await db.meta.get('lastSync'))?.value).toEqual(expect.any(Number))
  })
})

describe('runAnalysis', () => {
  it('resumes', async () => {
    await seedLiked(['a', 'b', 'c'])
    const ac = new AbortController()
    await run(ac.signal, () => ac.abort())
    expect(await db.profiles.count()).toBe(1)
    await run()
    expect(await db.profiles.count()).toBe(3)
    expect(classifyTrack).toHaveBeenCalledTimes(3)
  })

  it('NetworkError leaves track pending', async () => {
    await seedLiked(['a', 'b', 'c', 'd', 'e', 'f'])
    const errors = [
      new NetworkError('fetch failed'),
      new LastfmError(29, 'rate'),
      new SpotifyApiError(503, 'down'),
      new SpotifyApiError(429, 'slow'),
      new Error('refresh failed'),
    ]
    vi.mocked(classifyTrack).mockImplementation(async (t) => {
      const i = ['a', 'b', 'c', 'd', 'e'].indexOf(t.id!)
      if (i >= 0) throw errors[i]
      return profile(t.id!)
    })
    const progress = vi.fn()
    expect(await run(undefined, progress)).toEqual({ failed: 5 })
    expect(await db.profiles.count()).toBe(1)
    expect(await pendingTrackIds()).toHaveLength(5)
    expect(progress).toHaveBeenLastCalledWith(6, 6)
  })

  it('non-transient error stores none profile', async () => {
    await seedLiked(['a', 'b'])
    vi.mocked(classifyTrack).mockImplementation(async (t) => {
      if (t.id === 'a') throw new SpotifyApiError(404, 'nope')
      return profile('b')
    })
    expect(await run()).toEqual({ failed: 0 })
    expect(await db.profiles.get('a')).toMatchObject({ source: 'none', rawTags: [], genres: [] })
    expect(await db.profiles.get('b')).toBeDefined()
  })

  it('TypeError from code stores none profile and is logged', async () => {
    await seedLiked(['a'])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(classifyTrack).mockRejectedValue(new TypeError('x is undefined'))
    expect(await run()).toEqual({ failed: 0 })
    expect(await db.profiles.get('a')).toMatchObject({ source: 'none', rawTags: [] })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('AuthError aborts analysis', async () => {
    await seedLiked(['a', 'b'])
    vi.mocked(classifyTrack).mockRejectedValue(new AuthError('expired'))
    await expect(run()).rejects.toBeInstanceOf(AuthError)
    expect(classifyTrack).toHaveBeenCalledTimes(1)
    expect(await db.profiles.count()).toBe(0)
  })

  it('does not write profile for a track unliked during its analysis', async () => {
    await seedLiked(['a', 'b'])
    vi.mocked(classifyTrack).mockImplementation(async (t) => {
      if (t.id === 'a') await db.likedTracks.delete('a')
      return profile(t.id!)
    })
    await run()
    expect((await db.profiles.toArray()).map((p) => p.trackId)).toEqual(['b'])
  })

  it('lastfm invalid key aborts analysis', async () => {
    await seedLiked(['a', 'b'])
    vi.mocked(classifyTrack).mockRejectedValue(new LastfmError(10, 'Invalid API key'))
    await expect(run()).rejects.toBeInstanceOf(LastfmError)
    expect(classifyTrack).toHaveBeenCalledTimes(1)
    expect(await db.profiles.count()).toBe(0)
  })

  it('suspended lastfm key aborts analysis', async () => {
    await seedLiked(['a'])
    vi.mocked(classifyTrack).mockRejectedValue(new LastfmError(26, 'Suspended API key'))
    await expect(run()).rejects.toBeInstanceOf(LastfmError)
    expect(await db.profiles.count()).toBe(0)
  })

  it('Dexie error aborts analysis', async () => {
    await seedLiked(['a'])
    vi.mocked(classifyTrack).mockRejectedValue(new Dexie.QuotaExceededError('full'))
    await expect(run()).rejects.toBeInstanceOf(Dexie.DexieError)
    expect(await db.profiles.count()).toBe(0)
  })

  it('non-transient LastfmError stores none profile', async () => {
    await seedLiked(['a'])
    vi.mocked(classifyTrack).mockRejectedValue(new LastfmError(8, 'Operation failed'))
    expect(await run()).toEqual({ failed: 0 })
    expect(await db.profiles.get('a')).toMatchObject({ source: 'none', rawTags: [] })
  })
})

describe('forceResync', () => {
  it('clears profiles and artists', async () => {
    await seedLiked(['a'])
    await db.profiles.put(profile('a'))
    await db.artists.put({ artistId: 'a-a', lastfmTags: [], spotifyGenres: null, fetchedAt: 1 })
    await forceResync()
    expect(await db.profiles.count()).toBe(0)
    expect(await db.artists.count()).toBe(0)
    expect(await db.likedTracks.count()).toBe(1)
    expect(await pendingTrackIds()).toEqual(['a'])
  })
})
