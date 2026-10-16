import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ spotifyFetch: vi.fn(), fetchAllPages: vi.fn() }))
vi.mock('../../../src/lib/spotify/client', () => client)

import {
  addItemsToPlaylist,
  createPlaylist,
  getMyPlaylists,
  removePlaylistFromLibrary,
  renamePlaylist,
} from '../../../src/lib/spotify/api'

describe('spotify api', () => {
  beforeEach(() => {
    client.spotifyFetch.mockReset().mockResolvedValue(undefined)
    client.fetchAllPages.mockReset().mockResolvedValue([])
  })

  it('addItemsToPlaylist chunks by 100', async () => {
    const uris = Array.from({ length: 250 }, (_, i) => `spotify:track:${i}`)
    await addItemsToPlaylist('pl1', uris)
    const calls = client.spotifyFetch.mock.calls
    expect(calls).toHaveLength(3)
    for (const [path, init] of calls) {
      expect(path).toBe('/playlists/pl1/items')
      expect(init.method).toBe('POST')
    }
    expect(calls.map(([, init]) => JSON.parse(init.body).uris.length)).toEqual([100, 100, 50])
  })

  it('addItemsToPlaylist does nothing for 0 uris', async () => {
    await addItemsToPlaylist('pl1', [])
    expect(client.spotifyFetch).not.toHaveBeenCalled()
  })

  it('createPlaylist posts to /me/playlists with public:false by default', async () => {
    await createPlaylist({ name: 'N', description: 'D' })
    const [path, init] = client.spotifyFetch.mock.calls[0]
    expect(path).toBe('/me/playlists')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'N', description: 'D', public: false })
  })

  it('createPlaylist honours isPublic', async () => {
    await createPlaylist({ name: 'N', description: 'D', isPublic: true })
    expect(JSON.parse(client.spotifyFetch.mock.calls[0][1].body).public).toBe(true)
  })

  it('removePlaylistFromLibrary calls DELETE /me/library with the playlist uri', async () => {
    await removePlaylistFromLibrary('spotify:playlist:abc')
    const [path, init] = client.spotifyFetch.mock.calls[0]
    expect(path).toBe('/me/library?uris=spotify%3Aplaylist%3Aabc')
    expect(init.method).toBe('DELETE')
  })

  it('renamePlaylist PUTs the name', async () => {
    await renamePlaylist('pl1', 'Nouveau')
    const [path, init] = client.spotifyFetch.mock.calls[0]
    expect(path).toBe('/playlists/pl1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ name: 'Nouveau' })
  })

  it('getMyPlaylists pages /me/playlists', async () => {
    await getMyPlaylists()
    expect(client.fetchAllPages).toHaveBeenCalledWith('/me/playlists?limit=50')
  })
})
