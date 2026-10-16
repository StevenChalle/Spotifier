import { describe, expect, it } from 'vitest'
import type { LikedTrack } from '../../src/lib/db'
import { countByGenre, defaultPlaylistName, filterTracks, releaseYear } from '../../src/lib/filter'
import type { GenreProfile } from '../../src/lib/genres/classify'
import { TAXONOMY, type GenreRef } from '../../src/lib/genres/taxonomy'

const track = (id: string, releaseDate: string, addedAt: number): LikedTrack => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: [{ id: 'a', name: 'Artist' }],
  albumName: 'Album',
  releaseDate,
  releaseDatePrecision: 'day',
  addedAt,
})

const profile = (trackId: string, genres: GenreRef[], source: GenreProfile['source'] = 'lastfm-track'): GenreProfile => ({
  trackId,
  genres,
  source,
  rawTags: [],
  analyzedAt: 0,
})

const profiles = (...ps: GenreProfile[]) => new Map(ps.map((p) => [p.trackId, p]))
const ids = (ts: LikedTrack[]) => ts.map((t) => t.id)

describe('releaseYear', () => {
  it('extracts the year', () => {
    expect(releaseYear('1987')).toBe(1987)
    expect(releaseYear('1987-05')).toBe(1987)
    expect(releaseYear('2001-09-11')).toBe(2001)
  })
  it('returns null for missing or 0000', () => {
    expect(releaseYear('0000')).toBeNull()
    expect(releaseYear(undefined)).toBeNull()
    expect(releaseYear('')).toBeNull()
    expect(releaseYear('abcd')).toBeNull()
  })
})

describe('filterTracks', () => {
  const tracks = [track('a', '2010', 1), track('b', '2015-03', 3), track('c', '2020-01-01', 2), track('d', '', 4)]
  const ps = profiles(
    profile('a', [{ parent: 'electro', sub: 'house' }]),
    profile('b', [{ parent: 'electro' }, { parent: 'rap', sub: 'trap' }]),
    profile('c', [{ parent: 'rap' }]),
    profile('d', [{ parent: 'electro', sub: 'techno' }]),
  )

  it('filters by parent, sorted by addedAt desc', () => {
    expect(ids(filterTracks(tracks, ps, { parent: 'electro' }))).toEqual(['d', 'b', 'a'])
  })
  it('filters by sub', () => {
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', sub: 'house' }))).toEqual(['a'])
  })
  it('sub implies parent membership', () => {
    expect(ids(filterTracks(tracks, ps, { parent: 'rock', sub: 'house' }))).toEqual([])
    expect(ids(filterTracks(tracks, ps, { parent: 'rap', sub: 'house' }))).toEqual([])
  })
  it('year bounds are inclusive', () => {
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', yearMin: 2010, yearMax: 2015 }))).toEqual(['b', 'a'])
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', yearMin: 2011 }))).toEqual(['b'])
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', yearMax: 2014 }))).toEqual(['a'])
  })
  it('track without year excluded only when a year filter is set', () => {
    expect(ids(filterTracks(tracks, ps, { parent: 'electro' }))).toContain('d')
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', yearMin: 1900 }))).not.toContain('d')
    expect(ids(filterTracks(tracks, ps, { parent: 'electro', yearMax: 2100 }))).not.toContain('d')
  })
  it('never keeps tracks without profile, with none source or empty genres', () => {
    const t = [track('x', '2010', 1), track('y', '2010', 2), track('z', '2010', 3)]
    const p = profiles(profile('y', [], 'none'), profile('z', [{ parent: 'rap' }], 'none'))
    expect(filterTracks(t, p, { parent: 'rap' })).toEqual([])
  })
})

describe('countByGenre', () => {
  it('counts multi-genre tracks in each genre, once per parent/sub', () => {
    const tracks = [track('a', '2010', 1), track('b', '2010', 2), track('c', '2010', 3), track('d', '2010', 4), track('e', '2010', 5)]
    const ps = profiles(
      profile('a', [{ parent: 'electro', sub: 'house' }, { parent: 'electro', sub: 'techno' }, { parent: 'rap' }]),
      profile('b', [{ parent: 'electro' }, { parent: 'electro', sub: 'house' }]),
      profile('c', [], 'none'),
      profile('d', [{ parent: 'rock' }], 'none'),
      // e : pas de profil
    )
    const r = countByGenre(tracks, ps)
    expect(r.parents.electro).toBe(2)
    expect(r.parents.rap).toBe(1)
    expect(r.parents.rock).toBe(0)
    expect(r.subs.house).toBe(2)
    expect(r.subs.techno).toBe(1)
    expect(r.subs.trap).toBe(0)
    expect(r.unclassified).toBe(2)
  })
  it('returns complete records', () => {
    const r = countByGenre([], new Map())
    expect(Object.keys(r.parents).sort()).toEqual(TAXONOMY.map((e) => e.id).sort())
    expect(Object.keys(r.subs).sort()).toEqual(TAXONOMY.flatMap((e) => e.subs.map((s) => s.id)).sort())
    expect(r.unclassified).toBe(0)
  })
})

describe('defaultPlaylistName', () => {
  it('formats parent, sub and year range', () => {
    expect(defaultPlaylistName({ parent: 'electro', sub: 'house', yearMin: 2015, yearMax: 2020 })).toBe('Likés · Électro › House · 2015–2020')
  })
  it('formats open bounds', () => {
    expect(defaultPlaylistName({ parent: 'rap', yearMin: 2010 })).toBe('Likés · Rap / Hip-hop · depuis 2010')
    expect(defaultPlaylistName({ parent: 'rock', yearMax: 1990 })).toBe("Likés · Rock · jusqu'à 1990")
  })
  it('formats single year and no year', () => {
    expect(defaultPlaylistName({ parent: 'rock', yearMin: 2015, yearMax: 2015 })).toBe('Likés · Rock · 2015')
    expect(defaultPlaylistName({ parent: 'rock' })).toBe('Likés · Rock')
  })
})
