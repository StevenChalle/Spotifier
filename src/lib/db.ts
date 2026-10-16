import Dexie, { type EntityTable } from 'dexie'
import type { ArtistInfo, GenreProfile } from './genres/classify'

export type LikedTrack = {
  id: string
  uri: string
  name: string
  artists: { id: string | null; name: string }[]
  albumName: string
  releaseDate: string
  releaseDatePrecision: 'year' | 'month' | 'day'
  /** Epoch ms. */
  addedAt: number
  imageUrl?: string
}

export type MetaEntry = { key: string; value: unknown }

export class SpotifierDb extends Dexie {
  likedTracks!: EntityTable<LikedTrack, 'id'>
  profiles!: EntityTable<GenreProfile, 'trackId'>
  artists!: EntityTable<ArtistInfo, 'artistId'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor() {
    super('spotifier')
    this.version(1).stores({
      likedTracks: 'id',
      profiles: 'trackId',
      artists: 'artistId',
      meta: 'key',
    })
  }
}

export const db = new SpotifierDb()
