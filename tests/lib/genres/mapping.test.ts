import { describe, expect, it } from 'vitest'
import { ALIASES, EXACT_ONLY, TAXONOMY } from '../../../src/lib/genres/taxonomy'
import { mapTags, normalizeTag } from '../../../src/lib/genres/mapping'

describe('normalizeTag', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeTag('Rap Français')).toBe('rap francais')
  })

  it('turns - and _ into spaces and compacts whitespace', () => {
    expect(normalizeTag('Drum_and-Bass')).toBe('drum and bass')
    expect(normalizeTag('  Deep   House \n')).toBe('deep house')
  })
})

describe('mapTags', () => {
  it('maps an exact sub-genre alias to its parent and sub', () => {
    expect(mapTags(['deep house'])).toEqual([{ parent: 'electro', sub: 'house' }])
  })

  it('maps a parent-only alias without sub', () => {
    expect(mapTags(['hip hop'])).toEqual([{ parent: 'rap' }])
  })

  it('ignores tags that match nothing', () => {
    expect(mapTags(['seen live', 'favorites', 'female vocalists'])).toEqual([])
  })

  it('falls back to substring matching on word boundaries', () => {
    expect(mapTags(['melodic deep house'])).toContainEqual({ parent: 'electro', sub: 'house' })
  })

  it('keeps the longest matching alias', () => {
    expect(mapTags(['melodic deep house'])).toEqual([{ parent: 'electro', sub: 'house' }])
    expect(mapTags(['alternative hip hop'])).toEqual([{ parent: 'rap' }])
  })

  it('does not match inside a longer word', () => {
    expect(mapTags(['popular'])).toEqual([])
    expect(mapTags(['trapped'])).toEqual([])
    expect(mapTags(['rapture'])).toEqual([])
  })

  it('maps trap to Rap > Trap only, not to Rap as well', () => {
    expect(mapTags(['trap'])).toEqual([{ parent: 'rap', sub: 'trap' }])
  })

  it('returns several genres without duplicates', () => {
    const result = mapTags(['french hip hop', 'trap', 'Trap', 'rap francais'])
    expect(result).toContainEqual({ parent: 'rap', sub: 'rap-fr' })
    expect(result).toContainEqual({ parent: 'rap', sub: 'trap' })
    expect(result).toHaveLength(2)
  })

  it('drops a bare parent when a sub-genre of the same parent is present', () => {
    expect(mapTags(['hip hop', 'trap'])).toEqual([{ parent: 'rap', sub: 'trap' }])
  })

  it('normalizes tags before matching', () => {
    expect(mapTags(['Chanson Française'])).toEqual([{ parent: 'variete-chanson', sub: 'chanson-francaise' }])
    expect(mapTags(['R&B'])).toEqual([{ parent: 'rnb-soul' }])
  })

  it('resolves ambiguous tags as documented', () => {
    expect(mapTags(['electronic'])).toEqual([{ parent: 'electro' }])
    expect(mapTags(['soul'])).toEqual([{ parent: 'rnb-soul' }])
    expect(mapTags(['indie'])).toEqual([{ parent: 'rock', sub: 'indie-rock' }])
    expect(mapTags(['alternative'])).toEqual([{ parent: 'rock', sub: 'alternative' }])
  })
})

describe('mapTags substring path: modifiers and generic aliases do not win', () => {
  const cases: [string, object[]][] = [
    ['jazz piano', [{ parent: 'jazz' }]],
    ['rock opera', [{ parent: 'rock' }]],
    ['orchestral rock', [{ parent: 'rock' }]],
    ['orchestral pop', [{ parent: 'pop' }]],
    ['brazilian hip hop', [{ parent: 'rap' }]],
    ['brazilian funk', [{ parent: 'funk-disco', sub: 'funk' }]],
    ['acoustic rock', [{ parent: 'rock' }]],
    ['acoustic pop', [{ parent: 'pop' }]],
    ['hardcore techno', [{ parent: 'electro', sub: 'techno' }]],
    ['francophone hip hop', [{ parent: 'rap' }]],
    ['trap latino', [{ parent: 'rap', sub: 'trap' }]],
    ['latin trap', [{ parent: 'rap', sub: 'trap' }]],
    ['alternative dance', [{ parent: 'electro' }]],
    ['alternative country', [{ parent: 'folk-country', sub: 'country' }]],
    ['alternative pop', [{ parent: 'pop' }]],
    ['alternative hip hop', [{ parent: 'rap' }]],
    ['latin fusion', [{ parent: 'latin' }]],
    ['minimal wave', []],
    ['urban jazz', [{ parent: 'jazz' }]],
    ['lo fi beats', []],
    ['singer songwriter', []],
  ]
  it.each(cases)('%s', (tag, expected) => {
    expect(mapTags([tag])).toEqual(expected)
  })

  it('exact-only aliases still match a whole tag', () => {
    expect(mapTags(['piano'])).toEqual([{ parent: 'classical' }])
    expect(mapTags(['Alternative'])).toEqual([{ parent: 'rock', sub: 'alternative' }])
  })
})

describe('mapTags corrected aliases', () => {
  it.each([
    ['baroque pop', { parent: 'pop' }],
    ['dub techno', { parent: 'electro', sub: 'techno' }],
    ['industrial', undefined],
    ['grime', { parent: 'rap' }],
    ['uk garage', { parent: 'electro' }],
  ])('%s', (tag, expected) => {
    expect(mapTags([tag])).toEqual(expected ? [expected] : [])
  })
})

describe('mapTags tie-breaking and robustness', () => {
  it('prefers the sub-genre over a parent of equal alias length', () => {
    // `rock` (parent) and `punk` (sub) both have 4 characters
    expect(mapTags(['rock punk revival'])).toEqual([{ parent: 'rock', sub: 'punk' }])
  })

  it('does not read inherited object properties', () => {
    expect(mapTags(['constructor', '__proto__', 'toString', 'hasOwnProperty'])).toEqual([])
  })

  it('treats & as "and" and / as a separator', () => {
    expect(normalizeTag('drum & bass')).toBe('drum and bass')
    expect(normalizeTag('r&b/soul')).toBe('r and b soul')
    expect(mapTags(['drum & bass'])).toEqual([{ parent: 'electro', sub: 'drum-and-bass' }])
    expect(mapTags(['r&b/soul'])).toEqual([{ parent: 'rnb-soul' }])
    expect(mapTags(['hip hop/rap'])).toEqual([{ parent: 'rap' }])
  })
})

describe('taxonomy data', () => {
  it('EXACT_ONLY keys all exist in ALIASES', () => {
    for (const key of EXACT_ONLY) expect(Object.hasOwn(ALIASES, key), key).toBe(true)
  })

  it('has the 15 parents', () => {
    expect(TAXONOMY).toHaveLength(15)
  })

  it('has at least 150 aliases, all normalized keys', () => {
    const keys = Object.keys(ALIASES)
    expect(keys.length).toBeGreaterThanOrEqual(150)
    for (const key of keys) expect(normalizeTag(key)).toBe(key)
  })

  it('every alias points to an existing parent/sub', () => {
    for (const [alias, ref] of Object.entries(ALIASES)) {
      const parent = TAXONOMY.find((p) => p.id === ref.parent)
      expect(parent, `parent of "${alias}"`).toBeDefined()
      if (ref.sub !== undefined) {
        expect(
          parent!.subs.some((s) => s.id === ref.sub),
          `sub of "${alias}"`,
        ).toBe(true)
      }
    }
  })

  it('has unique sub ids', () => {
    const ids = TAXONOMY.flatMap((p) => p.subs.map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
