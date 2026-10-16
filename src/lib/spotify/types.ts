export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyUser {
  id: string
  display_name: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  uri: string
  owner: { id: string }
  images: SpotifyImage[]
  // Post-February 2026 name (`tracks` is deprecated). Absent on playlists the user does not own.
  items?: { total: number }
}

export interface SpotifyTrack {
  id: string | null
  uri: string
  name: string
  is_local: boolean
  artists: { id: string | null; name: string }[]
  album: {
    name: string
    release_date: string
    release_date_precision: 'year' | 'month' | 'day'
    images: SpotifyImage[]
  }
}

export interface SavedTrack {
  added_at: string
  track: SpotifyTrack | null
}

export interface SpotifyArtist {
  id: string
  name: string
  genres: string[]
}

export interface Page<T> {
  items: T[]
  next: string | null
  total: number
}
