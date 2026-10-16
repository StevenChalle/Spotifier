import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => {
  class AuthError extends Error {}
  return {
    AuthError,
    getValidAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  }
})
vi.mock('../../../src/lib/spotify/auth', () => auth)

import { NetworkError } from '../../../src/lib/errors'
import { fetchAllPages, spotifyFetch, SpotifyApiError } from '../../../src/lib/spotify/client'

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers })

describe('spotify client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    auth.getValidAccessToken.mockReset().mockResolvedValue('tok1')
    auth.refreshAccessToken.mockReset().mockResolvedValue('tok2')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const authHeader = (call: number) =>
    new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers).get('Authorization')

  it('spotifyFetch refreshes on 401 then retries once', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ id: 'me' }))
    await expect(spotifyFetch('/me')).resolves.toEqual({ id: 'me' })
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me')
    expect(authHeader(0)).toBe('Bearer tok1')
    expect(authHeader(1)).toBe('Bearer tok2')
  })

  it('throws AuthError on a second 401', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({}, 401)))
    await expect(spotifyFetch('/me')).rejects.toBeInstanceOf(auth.AuthError)
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws AuthError without a session', async () => {
    auth.getValidAccessToken.mockResolvedValue(null)
    await expect(spotifyFetch('/me')).rejects.toBeInstanceOf(auth.AuthError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries after Retry-After on 429', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(json({ ok: true }))
    const promise = spotifyFetch('/me')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after 5 retries on 429', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => Promise.resolve(json({}, 429)))
    const assertion = expect(spotifyFetch('/me')).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('returns undefined on 204 and on an empty 200 body', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    await expect(spotifyFetch('/a')).resolves.toBeUndefined()
    await expect(spotifyFetch('/b')).resolves.toBeUndefined()
  })

  it('throws a typed SpotifyApiError on other HTTP errors', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({}, 403)))
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SpotifyApiError)
    expect((error as SpotifyApiError).status).toBe(403)
  })

  it('wraps a rejected fetch in a NetworkError with its cause', async () => {
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).cause).toBe(cause)
  })

  it('fetchAllPages follows next until null', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [1, 2], next: 'https://api.spotify.com/v1/x?offset=2', total: 3 }))
      .mockResolvedValueOnce(json({ items: [3], next: null, total: 3 }))
    const progress = vi.fn()
    await expect(fetchAllPages<number>('/x', progress)).resolves.toEqual([1, 2, 3])
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.spotify.com/v1/x?offset=2')
    expect(progress.mock.calls).toEqual([[2, 3], [3, 3]])
  })
})
