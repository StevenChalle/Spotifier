import { fetchAllPages, spotifyFetch } from './client'
import type { SavedTrack, SpotifyArtist, SpotifyPlaylist, SpotifyUser } from './types'

const ADD_ITEMS_CHUNK = 100

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function getMe(): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>('/me')
}

export function getMyPlaylists(): Promise<SpotifyPlaylist[]> {
  return fetchAllPages<SpotifyPlaylist>('/me/playlists?limit=50')
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  await spotifyFetch<void>(`/playlists/${encodeURIComponent(id)}`, jsonInit('PUT', { name }))
}

// Unfollowing a playlist = removing it from the library (uris in the query string, max 40).
export async function removePlaylistFromLibrary(uri: string): Promise<void> {
  await spotifyFetch<void>(`/me/library?uris=${encodeURIComponent(uri)}`, { method: 'DELETE' })
}

export function getSavedTracks(onProgress?: (loaded: number, total: number) => void): Promise<SavedTrack[]> {
  return fetchAllPages<SavedTrack>('/me/tracks?limit=50', onProgress)
}

export function getArtist(id: string): Promise<SpotifyArtist> {
  return spotifyFetch<SpotifyArtist>(`/artists/${encodeURIComponent(id)}`)
}

export function createPlaylist(params: {
  name: string
  description: string
  isPublic?: boolean
}): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(
    '/me/playlists',
    jsonInit('POST', {
      name: params.name,
      description: params.description,
      public: params.isPublic ?? false,
    }),
  )
}

export async function addItemsToPlaylist(id: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += ADD_ITEMS_CHUNK) {
    await spotifyFetch<unknown>(
      `/playlists/${encodeURIComponent(id)}/items`,
      jsonInit('POST', { uris: uris.slice(i, i + ADD_ITEMS_CHUNK) }),
    )
  }
}
