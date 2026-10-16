import type { LikedTrack } from './db'
import type { GenreProfile } from './genres/classify'
import { TAXONOMY, type ParentId, type SubId } from './genres/taxonomy'

export type TrackFilter = { parent: ParentId; sub?: SubId; yearMin?: number; yearMax?: number }

/** 4 premiers chiffres de la date de sortie ; `null` si absente, invalide ou `0000`. */
export function releaseYear(date: string | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '')
  if (!m) return null
  const year = Number(m[1])
  return year === 0 ? null : year
}

/** Profil exploitable : analysé, source autre que `none`, au moins un genre. */
const usableGenres = (p: GenreProfile | undefined) =>
  p && p.source !== 'none' && p.genres.length > 0 ? p.genres : null

export function filterTracks(
  tracks: LikedTrack[],
  profiles: Map<string, GenreProfile>,
  f: TrackFilter,
): LikedTrack[] {
  const hasYearFilter = f.yearMin !== undefined || f.yearMax !== undefined
  return tracks
    .filter((t) => {
      const genres = usableGenres(profiles.get(t.id))
      if (!genres) return false
      if (!genres.some((g) => (f.sub ? g.sub === f.sub && g.parent === f.parent : g.parent === f.parent))) return false
      if (!hasYearFilter) return true
      const year = releaseYear(t.releaseDate)
      if (year === null) return false
      return (f.yearMin === undefined || year >= f.yearMin) && (f.yearMax === undefined || year <= f.yearMax)
    })
    .sort((a, b) => b.addedAt - a.addedAt)
}

export function countByGenre(
  tracks: LikedTrack[],
  profiles: Map<string, GenreProfile>,
): { parents: Record<ParentId, number>; subs: Record<SubId, number>; unclassified: number } {
  const parents = {} as Record<ParentId, number>
  const subs = {} as Record<SubId, number>
  for (const entry of TAXONOMY) {
    parents[entry.id] = 0
    for (const s of entry.subs) subs[s.id] = 0
  }
  let unclassified = 0
  for (const t of tracks) {
    const profile = profiles.get(t.id)
    if (!profile) continue
    const genres = usableGenres(profile)
    if (!genres) {
      unclassified++
      continue
    }
    const seenParents = new Set<ParentId>()
    const seenSubs = new Set<SubId>()
    for (const g of genres) {
      seenParents.add(g.parent)
      if (g.sub) seenSubs.add(g.sub)
    }
    for (const p of seenParents) parents[p]++
    for (const s of seenSubs) subs[s]++
  }
  return { parents, subs, unclassified }
}

export function defaultPlaylistName(f: TrackFilter): string {
  const entry = TAXONOMY.find((e) => e.id === f.parent)
  const parentLabel = entry?.label ?? f.parent
  const subLabel = f.sub ? entry?.subs.find((s) => s.id === f.sub)?.label : undefined
  const parts = ['Likés', subLabel ? `${parentLabel} › ${subLabel}` : parentLabel]
  const { yearMin, yearMax } = f
  if (yearMin !== undefined && yearMax !== undefined) {
    parts.push(yearMin === yearMax ? `${yearMin}` : `${yearMin}–${yearMax}`)
  } else if (yearMin !== undefined) {
    parts.push(`depuis ${yearMin}`)
  } else if (yearMax !== undefined) {
    parts.push(`jusqu'à ${yearMax}`)
  }
  return parts.join(' · ')
}
