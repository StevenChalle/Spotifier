/// <reference types="node" />
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCOPES =
  'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify'

async function loadAuth() {
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'test-client-id')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:8888/callback')
  vi.stubEnv('VITE_LASTFM_API_KEY', 'test-lastfm-key')
  vi.resetModules()
  return import('../../../src/lib/spotify/auth')
}

function tokenResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('spotify auth', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('computeCodeChallenge matches node crypto', async () => {
    const { computeCodeChallenge } = await loadAuth()
    const verifier = 'abcDEF123-._~xyz'
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(await computeCodeChallenge(verifier)).toBe(expected)
  })

  it('generateCodeVerifier returns 64 unreserved characters', async () => {
    const { generateCodeVerifier } = await loadAuth()
    const verifier = generateCodeVerifier()
    expect(verifier).toHaveLength(64)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(generateCodeVerifier()).not.toBe(verifier)
  })

  it('buildAuthorizeUrl contains the PKCE parameters', async () => {
    const { buildAuthorizeUrl } = await loadAuth()
    const url = new URL(buildAuthorizeUrl({ challenge: 'chal', state: 'st' }))
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8888/callback')
    expect(url.searchParams.get('scope')).toBe(SCOPES)
  })

  it('beginLogin stores verifier and state then redirects', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const { beginLogin } = await loadAuth()
    await beginLogin()
    const verifier = sessionStorage.getItem('spotifier.pkce_verifier')
    const state = sessionStorage.getItem('spotifier.pkce_state')
    expect(verifier).toHaveLength(64)
    expect(state).toBeTruthy()
    const target = new URL(assign.mock.calls[0][0] as string)
    expect(target.searchParams.get('state')).toBe(state)
    expect(target.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier!).digest('base64url'),
    )
  })

  it('handleCallback rejects mismatched state', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { handleCallback, AuthError } = await loadAuth()
    sessionStorage.setItem('spotifier.pkce_verifier', 'v')
    sessionStorage.setItem('spotifier.pkce_state', 'expected')
    const url = new URL('http://127.0.0.1:8888/callback?code=abc&state=other')
    await expect(handleCallback(url)).rejects.toBeInstanceOf(AuthError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('spotifier.tokens')).toBeNull()
  })

  it('handleCallback exchanges the code and stores tokens', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        tokenResponse({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { handleCallback } = await loadAuth()
    sessionStorage.setItem('spotifier.pkce_verifier', 'my-verifier')
    sessionStorage.setItem('spotifier.pkce_state', 'st')
    await handleCallback(new URL('http://127.0.0.1:8888/callback?code=abc&state=st'))

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('https://accounts.spotify.com/api/token')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc')
    expect(body.get('code_verifier')).toBe('my-verifier')
    expect(body.get('client_id')).toBe('test-client-id')
    expect(body.get('redirect_uri')).toBe('http://127.0.0.1:8888/callback')
    expect(JSON.parse(localStorage.getItem('spotifier.tokens')!)).toEqual({
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresAt: 1_000_000 + 3_600_000,
    })
    expect(sessionStorage.getItem('spotifier.pkce_verifier')).toBeNull()
    expect(sessionStorage.getItem('spotifier.pkce_state')).toBeNull()
  })

  it('getValidAccessToken returns null without tokens', async () => {
    const { getValidAccessToken } = await loadAuth()
    expect(await getValidAccessToken()).toBeNull()
  })

  it('getValidAccessToken returns the stored token when still valid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { getValidAccessToken } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() + 120_000 }),
    )
    expect(await getValidAccessToken()).toBe('old')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getValidAccessToken refreshes when token expires in < 60s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(tokenResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getValidAccessToken } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() + 30_000 }),
    )
    expect(await getValidAccessToken()).toBe('new')
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('r1')
    expect(body.get('client_id')).toBe('test-client-id')
    // Spotify may omit refresh_token: the previous one is kept.
    const stored = JSON.parse(localStorage.getItem('spotifier.tokens')!)
    expect(stored.refreshToken).toBe('r1')
    expect(stored.accessToken).toBe('new')
  })

  it('refreshAccessToken throws AuthError and purges tokens on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse({ error: 'invalid_grant' }, 400)))
    const { refreshAccessToken, AuthError } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 }),
    )
    await expect(refreshAccessToken()).rejects.toBeInstanceOf(AuthError)
    expect(localStorage.getItem('spotifier.tokens')).toBeNull()
  })

  it('concurrent refreshes share a single fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(tokenResponse({ access_token: 'new', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    const { refreshAccessToken, getValidAccessToken } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 }),
    )
    const results = await Promise.all([
      refreshAccessToken(),
      getValidAccessToken(),
      refreshAccessToken(),
    ])
    expect(results).toEqual(['new', 'new', 'new'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('network error during refresh keeps tokens and does not throw AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { refreshAccessToken, AuthError } = await loadAuth()
    const stored = JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 })
    localStorage.setItem('spotifier.tokens', stored)
    const error = await refreshAccessToken().catch((e: unknown) => e)
    const { NetworkError } = await import('../../../src/lib/errors')
    expect(error).toBeInstanceOf(NetworkError)
    expect(error).not.toBeInstanceOf(AuthError)
    expect(localStorage.getItem('spotifier.tokens')).toBe(stored)
  })

  it('5xx during refresh keeps tokens and does not throw AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse({}, 503)))
    const { refreshAccessToken, AuthError } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 }),
    )
    const error = await refreshAccessToken().catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(AuthError)
    expect(localStorage.getItem('spotifier.tokens')).not.toBeNull()
  })

  it('400 invalid_grant purges tokens and throws AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse({ error: 'invalid_grant' }, 400)))
    const { refreshAccessToken, AuthError } = await loadAuth()
    localStorage.setItem(
      'spotifier.tokens',
      JSON.stringify({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 }),
    )
    await expect(refreshAccessToken()).rejects.toBeInstanceOf(AuthError)
    expect(localStorage.getItem('spotifier.tokens')).toBeNull()
  })

  it('malformed token response throws AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))
    const { handleCallback, AuthError } = await loadAuth()
    sessionStorage.setItem('spotifier.pkce_verifier', 'v')
    sessionStorage.setItem('spotifier.pkce_state', 's')
    await expect(
      handleCallback(new URL('http://127.0.0.1:8888/callback?code=c&state=s')),
    ).rejects.toBeInstanceOf(AuthError)
  })

  it('logout clears the stored tokens', async () => {
    const { logout } = await loadAuth()
    localStorage.setItem('spotifier.tokens', '{}')
    logout()
    expect(localStorage.getItem('spotifier.tokens')).toBeNull()
  })
})
