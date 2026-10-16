import { ALIASES, EXACT_ONLY, type GenreRef } from './taxonomy'

/** Minuscules, sans accents (NFD), `&` -> `and`, `-`/`_`/`/` -> espace, espaces compactés, trim. */
export function normalizeTag(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Candidate = { alias: string; ref: GenreRef; padded: string }

// Sous-genres d'abord, puis parents (départage à longueur égale) ; l'ordre de
// déclaration est conservé (le tri est stable).
const CANDIDATES: Candidate[] = Object.entries(ALIASES)
  .filter(([alias]) => !EXACT_ONLY.has(alias))
  .map(([alias, ref]) => ({ alias, ref, padded: ` ${alias} ` }))
  .sort((a, b) => Number(b.ref.sub !== undefined) - Number(a.ref.sub !== undefined))

function mapOne(normalized: string): GenreRef | undefined {
  if (Object.hasOwn(ALIASES, normalized)) return ALIASES[normalized]
  const haystack = ` ${normalized} `
  let best: Candidate | undefined
  for (const c of CANDIDATES) {
    // Les espaces servent de limites de mots : `pop` ne matche pas `popular`, `rap` pas `trap`.
    if (haystack.includes(c.padded) && (!best || c.alias.length > best.alias.length)) best = c
  }
  return best?.ref
}

/**
 * Mappe des tags bruts vers des genres, sans doublons. Un sous-genre porte son parent
 * (`{ parent, sub }`) ; un parent seul est omis si un sous-genre du même parent est présent.
 */
export function mapTags(tags: string[]): GenreRef[] {
  const seen = new Map<string, GenreRef>()
  for (const tag of tags) {
    const ref = mapOne(normalizeTag(tag))
    if (ref) seen.set(`${ref.parent}/${ref.sub ?? ''}`, ref)
  }
  const parentsWithSub = new Set([...seen.values()].filter((r) => r.sub).map((r) => r.parent))
  return [...seen.values()].filter((r) => r.sub !== undefined || !parentsWithSub.has(r.parent))
}
