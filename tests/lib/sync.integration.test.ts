import { beforeEach, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'

vi.mock('../../src/lib/spotify/api', () => ({ getSavedTracks: vi.fn(), getArtist: vi.fn() }))
vi.mock('../../src/lib/lastfm/client', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/lastfm/client')>()),
  getTrackTopTags: vi.fn(),
  getArtistTopTags: vi.fn(),
}))

import { getArtistTopTags, getTrackTopTags } from '../../src/lib/lastfm/client'
import { getArtist, getSavedTracks } from '../../src/lib/spotify/api'
import { runAnalysis, syncLikedTracks } from '../../src/lib/sync'

beforeEach(async () => {
  vi.resetAllMocks()
  await Promise.all([db.likedTracks.clear(), db.profiles.clear(), db.artists.clear(), db.meta.clear()])
})

it('runs the real classifier with real deps and fills the artist cache', async () => {
  const mk = (id: string) => ({
    added_at: '2024-01-01T00:00:00Z',
    track: {
      id,
      uri: `spotify:track:${id}`,
      name: `Song ${id}`,
      is_local: false,
      artists: [{ id: 'artist-1', name: 'Same Artist' }],
      album: { name: 'Album', release_date: '2000', release_date_precision: 'year' as const, images: [] },
    },
  })
  vi.mocked(getSavedTracks).mockResolvedValue([mk('a'), mk('b')])
  await syncLikedTracks()
  vi.mocked(getTrackTopTags).mockResolvedValue([])
  vi.mocked(getArtistTopTags).mockResolvedValue([{ name: 'rock', count: 100 }])
  vi.mocked(getArtist).mockResolvedValue({ id: 'artist-1', name: 'Same Artist', genres: [] })

  expect(await runAnalysis({ signal: new AbortController().signal, onProgress: () => {} })).toEqual({ failed: 0 })

  const profiles = await db.profiles.toArray()
  expect(profiles).toHaveLength(2)
  expect(profiles.every((p) => p.source === 'lastfm-artist')).toBe(true)
  expect((await db.artists.get('artist-1'))?.lastfmTags).toEqual([{ name: 'rock', count: 100 }])
  // Second track reuses the artist cache: a single artist call for both.
  expect(getArtistTopTags).toHaveBeenCalledTimes(1)
})
