import { networkFetch } from '../errors'
import { AuthError, getValidAccessToken, refreshAccessToken } from './auth'
import type { Page } from './types'

const API_BASE = 'https://api.spotify.com/v1'
const MAX_RATE_LIMIT_RETRIES = 5
const DEFAULT_RETRY_AFTER_S = 1

export class SpotifyApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

function resolveUrl(path: string): string {
  // `next` links returned by Spotify are already absolute.
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'))
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_S) * 1000
}

// One authenticated request, waiting out 429s (max 5 retries).
async function send(url: string, init: RequestInit | undefined, token: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await networkFetch(url, { ...init, headers })
    if (response.status !== 429) return response
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new SpotifyApiError(429, 'Spotify : trop de requêtes, réessayez plus tard.')
    }
    await sleep(retryAfterMs(response))
  }
}

export async function spotifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveUrl(path)
  const token = await getValidAccessToken()
  if (!token) throw new AuthError('not authenticated')

  let response = await send(url, init, token)
  if (response.status === 401) {
    // Single refresh + single retry; a second 401 is a definitive auth failure.
    const fresh = await refreshAccessToken()
    response = await send(url, init, fresh)
    if (response.status === 401) throw new AuthError('Spotify a rejeté le token après rafraîchissement.')
  }

  if (!response.ok) {
    throw new SpotifyApiError(response.status, `Erreur Spotify ${response.status} sur ${url}`)
  }
  if (response.status === 204) return undefined as T
  // Some endpoints answer 200 with an empty body (e.g. PUT /playlists/{id}).
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export async function fetchAllPages<T>(
  firstPath: string,
  onPage?: (loaded: number, total: number) => void,
): Promise<T[]> {
  const all: T[] = []
  let next: string | null = firstPath
  while (next) {
    const page: Page<T> = await spotifyFetch<Page<T>>(next)
    all.push(...page.items)
    onPage?.(all.length, page.total)
    next = page.next
  }
  return all
}
