import { afterEach, describe, expect, it, vi } from 'vitest'

function stubEnv(overrides: Record<string, string> = {}) {
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-client-id')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:8888/callback')
  vi.stubEnv('VITE_LASTFM_API_KEY', 'test-lastfm-key')
  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value)
  vi.resetModules()
}

describe('smoke', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('runs the test runner', () => {
    expect(1 + 1).toBe(2)
  })

  it('config returns the expected object when all variables are set', async () => {
    stubEnv()
    const { config } = await import('../src/config')
    expect(config).toEqual({
      spotifyClientId: 'test-client-id',
      spotifyRedirectUri: 'http://127.0.0.1:8888/callback',
      lastfmApiKey: 'test-lastfm-key',
    })
  })

  it('config throws when VITE_LASTFM_API_KEY is empty', async () => {
    stubEnv({ VITE_LASTFM_API_KEY: '' })
    await expect(import('../src/config')).rejects.toThrow('VITE_LASTFM_API_KEY')
  })
})
