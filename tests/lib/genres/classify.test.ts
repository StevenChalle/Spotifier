import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARTIST_TOP_N,
  TAG_MIN_COUNT,
  classifyTrack,
  type ArtistInfo,
  type ClassifyDeps,
} from '../../../src/lib/genres/classify'
import type { SpotifyTrack } from '../../../src/lib/spotify/types'

const NOW = 1_700_000_000_000

function makeTrack(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: 't1',
    uri: 'spotify:track:t1',
    name: 'Song - Remastered 2011',
    is_local: false,
    artists: [
      { id: 'a1', name: 'Artist One' },
      { id: 'a2', name: 'Second' },
    ],
    album: { name: 'Album', release_date: '2011', release_date_precision: 'year', images: [] },
    ...overrides,
  }
}

function makeDeps(overrides: Partial<ClassifyDeps> = {}): ClassifyDeps {
  return {
    trackTags: vi.fn().mockResolvedValue([]),
    artistTags: vi.fn().mockResolvedValue([]),
    spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One', genres: [] }),
    getArtistInfo: vi.fn().mockResolvedValue(undefined),
    saveArtistInfo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('classifyTrack', () => {
  it('uses only track tags when they map', async () => {
    const deps = makeDeps({
      trackTags: vi.fn().mockResolvedValue([
        { name: 'deep house', count: 50 },
        { name: 'seen live', count: 40 },
      ]),
      artistTags: vi.fn().mockResolvedValue([{ name: 'techno', count: 90 }]),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile).toEqual({
      trackId: 't1',
      genres: [{ parent: 'electro', sub: 'house' }],
      source: 'lastfm-track',
      rawTags: ['deep house', 'seen live'],
      analyzedAt: NOW,
    })
    expect(deps.artistTags).not.toHaveBeenCalled()
    expect(deps.getArtistInfo).not.toHaveBeenCalled()
  })

  it('passes the main artist name and the cleaned title to trackTags', async () => {
    const deps = makeDeps()
    await classifyTrack(makeTrack(), deps)
    expect(deps.trackTags).toHaveBeenCalledWith('Artist One', 'Song')
  })

  it('ignores track tags below TAG_MIN_COUNT', async () => {
    const deps = makeDeps({
      trackTags: vi.fn().mockResolvedValue([{ name: 'deep house', count: TAG_MIN_COUNT - 1 }]),
      artistTags: vi.fn().mockResolvedValue([{ name: 'rock', count: 80 }]),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile.source).toBe('lastfm-artist')
    expect(profile.genres).toEqual([{ parent: 'rock' }])
  })

  it('falls back to artist top 5 tags', async () => {
    const deps = makeDeps({
      trackTags: vi.fn().mockResolvedValue([{ name: 'seen live', count: 99 }]),
      artistTags: vi.fn().mockResolvedValue([
        { name: 'seen live', count: 100 },
        { name: 'techno', count: 50 },
        { name: 'rock', count: TAG_MIN_COUNT - 1 },
      ]),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile).toMatchObject({
      source: 'lastfm-artist',
      genres: [{ parent: 'electro', sub: 'techno' }],
      rawTags: ['seen live', 'techno'],
    })
  })

  it('only considers the ARTIST_TOP_N strongest artist tags', async () => {
    expect(ARTIST_TOP_N).toBe(5)
    const deps = makeDeps({
      artistTags: vi.fn().mockResolvedValue([
        { name: 'a', count: 100 },
        { name: 'b', count: 90 },
        { name: 'c', count: 80 },
        { name: 'd', count: 70 },
        { name: 'e', count: 60 },
        { name: 'techno', count: 50 },
      ]),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile.source).toBe('none')
  })

  it('falls back to spotify artist genres', async () => {
    const deps = makeDeps({
      spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One', genres: ['french hip hop'] }),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile.source).toBe('spotify-artist')
    expect(profile.rawTags).toEqual(['french hip hop'])
    expect(profile.genres.length).toBeGreaterThan(0)
    expect(deps.spotifyArtist).toHaveBeenCalledWith('a1')
  })

  it('artist without genres field stores [] and classifies none', async () => {
    const deps = makeDeps({
      spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One' }),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile.source).toBe('none')
    expect(deps.saveArtistInfo).toHaveBeenCalledWith({
      artistId: 'a1',
      lastfmTags: [],
      spotifyGenres: [],
      fetchedAt: NOW,
    })
  })

  it('treats an undefined cached spotifyGenres as not yet requested', async () => {
    const info = { artistId: 'a1', lastfmTags: [], spotifyGenres: undefined, fetchedAt: 1 } as unknown as ArtistInfo
    const deps = makeDeps({
      getArtistInfo: vi.fn().mockResolvedValue(info),
      spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One', genres: ['jazz'] }),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(deps.spotifyArtist).toHaveBeenCalledWith('a1')
    expect(profile.source).toBe('spotify-artist')
  })

  it('returns none when nothing maps', async () => {
    const deps = makeDeps({
      spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One', genres: ['zzz'] }),
    })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile).toEqual({ trackId: 't1', genres: [], source: 'none', rawTags: [], analyzedAt: NOW })
  })

  it('reuses cached artist info', async () => {
    const info: ArtistInfo = {
      artistId: 'a1',
      lastfmTags: [{ name: 'techno', count: 60 }],
      spotifyGenres: null,
      fetchedAt: 1,
    }
    const deps = makeDeps({ getArtistInfo: vi.fn().mockResolvedValue(info) })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(deps.artistTags).not.toHaveBeenCalled()
    expect(deps.spotifyArtist).not.toHaveBeenCalled()
    expect(deps.saveArtistInfo).not.toHaveBeenCalled()
    expect(profile.source).toBe('lastfm-artist')
  })

  it('does not call spotifyArtist when last.fm artist tags map', async () => {
    const deps = makeDeps({ artistTags: vi.fn().mockResolvedValue([{ name: 'techno', count: 60 }]) })
    await classifyTrack(makeTrack(), deps)
    expect(deps.spotifyArtist).not.toHaveBeenCalled()
    expect(deps.saveArtistInfo).toHaveBeenCalledWith({
      artistId: 'a1',
      lastfmTags: [{ name: 'techno', count: 60 }],
      spotifyGenres: null,
      fetchedAt: NOW,
    })
  })

  it('uses cached spotify genres without calling spotifyArtist', async () => {
    const info: ArtistInfo = { artistId: 'a1', lastfmTags: [], spotifyGenres: ['jazz'], fetchedAt: 1 }
    const deps = makeDeps({ getArtistInfo: vi.fn().mockResolvedValue(info) })
    const profile = await classifyTrack(makeTrack(), deps)
    expect(profile.source).toBe('spotify-artist')
    expect(deps.spotifyArtist).not.toHaveBeenCalled()
    expect(deps.saveArtistInfo).not.toHaveBeenCalled()
  })

  it('fetches spotify genres and saves them when the cache holds only last.fm tags', async () => {
    const info: ArtistInfo = { artistId: 'a1', lastfmTags: [], spotifyGenres: null, fetchedAt: 1 }
    const deps = makeDeps({
      getArtistInfo: vi.fn().mockResolvedValue(info),
      spotifyArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Artist One', genres: ['jazz'] }),
    })
    await classifyTrack(makeTrack(), deps)
    expect(deps.artistTags).not.toHaveBeenCalled()
    expect(deps.saveArtistInfo).toHaveBeenCalledWith({
      artistId: 'a1',
      lastfmTags: [],
      spotifyGenres: ['jazz'],
      fetchedAt: NOW,
    })
  })

  it('skips the artist cache and spotifyArtist when the artist id is null', async () => {
    const local = makeTrack({ artists: [{ id: null, name: 'Local Artist' }] })
    const withTags = makeDeps({ artistTags: vi.fn().mockResolvedValue([{ name: 'techno', count: 60 }]) })
    const profile = await classifyTrack(local, withTags)
    expect(profile.source).toBe('lastfm-artist')
    expect(withTags.artistTags).toHaveBeenCalledWith('Local Artist')
    expect(withTags.getArtistInfo).not.toHaveBeenCalled()
    expect(withTags.saveArtistInfo).not.toHaveBeenCalled()

    const empty = makeDeps()
    const none = await classifyTrack(local, empty)
    expect(none.source).toBe('none')
    expect(empty.spotifyArtist).not.toHaveBeenCalled()
  })

  it('lets dependency errors propagate', async () => {
    const deps = makeDeps({ trackTags: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(classifyTrack(makeTrack(), deps)).rejects.toThrow('boom')
  })
})
