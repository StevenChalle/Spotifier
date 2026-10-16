import { describe, expect, it } from 'vitest'
import { NAV_FALLBACK_DENYLIST } from '../pwa-denylist.ts'

describe('NAV_FALLBACK_DENYLIST', () => {
  it.each(['/sw.js', '/manifest.webmanifest', '/icons/icon-512.png'])('excludes %s', (path) => {
    expect(NAV_FALLBACK_DENYLIST.test(path)).toBe(true)
  })

  it.each(['/callback?code=abc.def', '/callback?code=x', '/playlists', '/create'])(
    'serves the app shell for %s',
    (path) => {
      expect(NAV_FALLBACK_DENYLIST.test(path)).toBe(false)
    },
  )
})
