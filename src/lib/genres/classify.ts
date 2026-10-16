import { cleanTrackTitle, type WeightedTag } from '../lastfm/client'
import type { SpotifyArtist, SpotifyTrack } from '../spotify/types'
import { mapTags } from './mapping'
import type { GenreRef } from './taxonomy'

export type GenreSource = 'lastfm-track' | 'lastfm-artist' | 'spotify-artist' | 'none'

export type GenreProfile = {
  trackId: string
  genres: GenreRef[]
  source: GenreSource
  /** Noms des tags de la source retenue (au-dessus du seuil, ou genres Spotify) ; `[]` si `none`. */
  rawTags: string[]
  analyzedAt: number
}

export type ArtistInfo = {
  artistId: string
  lastfmTags: WeightedTag[]
  /** `null` = pas encore demandé à Spotify. */
  spotifyGenres: string[] | null
  fetchedAt: number
}

export type ClassifyDeps = {
  trackTags(artist: string, title: string): Promise<WeightedTag[]>
  artistTags(artist: string): Promise<WeightedTag[]>
  spotifyArtist(id: string): Promise<SpotifyArtist>
  getArtistInfo(id: string): Promise<ArtistInfo | undefined>
  saveArtistInfo(info: ArtistInfo): Promise<void>
}

export const TAG_MIN_COUNT = 10
export const ARTIST_TOP_N = 5

const aboveThreshold = (tags: WeightedTag[]): WeightedTag[] =>
  tags.filter((t) => t.count >= TAG_MIN_COUNT)

/**
 * Cascade stricte (spec §7) : tags Last.fm du titre, puis de l'artiste (top N), puis genres
 * Spotify de l'artiste, sinon `none`. Les erreurs des dépendances remontent telles quelles.
 */
export async function classifyTrack(track: SpotifyTrack, deps: ClassifyDeps): Promise<GenreProfile> {
  const trackId = track.id ?? track.uri
  const done = (source: GenreSource, genres: GenreRef[], rawTags: string[]): GenreProfile => ({
    trackId,
    genres,
    source,
    rawTags,
    analyzedAt: Date.now(),
  })
  const none = () => done('none', [], [])

  const artist = track.artists[0]
  if (!artist) return none()

  // 1. Tags Last.fm du titre.
  const titleTags = aboveThreshold(await deps.trackTags(artist.name, cleanTrackTitle(track.name)))
  const titleGenres = mapTags(titleTags.map((t) => t.name))
  if (titleGenres.length > 0) return done('lastfm-track', titleGenres, titleTags.map((t) => t.name))

  // 2. Tags Last.fm de l'artiste (cache par id Spotify ; pas de cache sans id).
  const cached = artist.id === null ? undefined : await deps.getArtistInfo(artist.id)
  let dirty = cached?.lastfmTags === undefined
  const lastfmTags = cached?.lastfmTags ?? (await deps.artistTags(artist.name))
  const save = async (spotifyGenres: string[] | null) => {
    if (artist.id !== null && dirty) {
      await deps.saveArtistInfo({ artistId: artist.id, lastfmTags, spotifyGenres, fetchedAt: Date.now() })
    }
  }

  const topTags = aboveThreshold(lastfmTags)
    .sort((a, b) => b.count - a.count)
    .slice(0, ARTIST_TOP_N)
  const artistGenres = mapTags(topTags.map((t) => t.name))
  if (artistGenres.length > 0) {
    await save(cached?.spotifyGenres ?? null)
    return done('lastfm-artist', artistGenres, topTags.map((t) => t.name))
  }

  // 3. Genres Spotify de l'artiste (impossible sans id).
  if (artist.id === null) return none()
  // `undefined` (value stored by an older build) counts as not yet requested.
  let spotifyGenres = cached?.spotifyGenres ?? null
  if (spotifyGenres === null) {
    // Spotify may omit `genres`: store [] so the artist is not requested again.
    spotifyGenres = (await deps.spotifyArtist(artist.id)).genres ?? []
    dirty = true
  }
  await save(spotifyGenres)
  const spotifyMapped = mapTags(spotifyGenres)
  if (spotifyMapped.length > 0) return done('spotify-artist', spotifyMapped, spotifyGenres)

  // 4. Non classé.
  return none()
}
