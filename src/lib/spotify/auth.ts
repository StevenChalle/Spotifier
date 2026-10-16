import { config } from '../../config'
import { networkFetch } from '../errors'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES =
  'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify'

const TOKENS_KEY = 'spotifier.tokens'
const VERIFIER_KEY = 'spotifier.pkce_verifier'
const STATE_KEY = 'spotifier.pkce_state'

const VERIFIER_LENGTH = 64
const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const REFRESH_MARGIN_MS = 60_000

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  // Rejection sampling: 198 = 3 * 66, so `byte % 66` stays uniform.
  const limit = 256 - (256 % VERIFIER_CHARS.length)
  let verifier = ''
  while (verifier.length < VERIFIER_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(VERIFIER_LENGTH))) {
      if (byte < limit && verifier.length < VERIFIER_LENGTH) {
        verifier += VERIFIER_CHARS[byte % VERIFIER_CHARS.length]
      }
    }
  }
  return verifier
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

function generateState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)))
}

export function buildAuthorizeUrl(params: { challenge: string; state: string }): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotifyClientId,
    redirect_uri: config.spotifyRedirectUri,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: params.challenge,
    state: params.state,
  })
  return `${AUTHORIZE_URL}?${query.toString()}`
}

export async function beginLogin(): Promise<void> {
  const verifier = generateCodeVerifier()
  const state = generateState()
  const challenge = await computeCodeChallenge(verifier)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  window.location.assign(buildAuthorizeUrl({ challenge, state }))
}

function readTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return parsed as StoredTokens
    }
  } catch {
    // Corrupted entry: treated as no session.
  }
  return null
}

function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

// Definitive rejections (400/401, e.g. invalid_grant) throw AuthError; network
// errors (NetworkError) and 5xx throw a plain Error so callers can keep the session.
async function requestTokens(body: Record<string, string>): Promise<TokenResponse> {
  const response = await networkFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: config.spotifyClientId }).toString(),
  })
  if (response.status === 400 || response.status === 401) {
    throw new AuthError(`Spotify a refusé la demande d'authentification (${response.status}).`)
  }
  if (!response.ok) {
    throw new Error(`Spotify indisponible (${response.status}).`)
  }
  let data: Partial<TokenResponse>
  try {
    data = (await response.json()) as Partial<TokenResponse>
  } catch {
    throw new AuthError('Réponse de token Spotify illisible.')
  }
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new AuthError('Réponse de token Spotify invalide.')
  }
  return data as TokenResponse
}

export async function handleCallback(url: URL): Promise<void> {
  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  // One-shot values: never reusable, whatever the outcome.
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)

  const error = url.searchParams.get('error')
  if (error) throw new AuthError(`Connexion Spotify refusée : ${error}`)
  if (!expectedState || url.searchParams.get('state') !== expectedState) {
    throw new AuthError('État de connexion invalide (state différent).')
  }
  const code = url.searchParams.get('code')
  if (!code || !verifier) throw new AuthError('Code d’autorisation ou vérificateur manquant.')

  const data = await requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.spotifyRedirectUri,
    code_verifier: verifier,
  })
  if (!data.refresh_token) throw new AuthError('Spotify n’a pas renvoyé de refresh token.')
  storeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })
}

let refreshInFlight: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  const tokens = readTokens()
  if (!tokens) throw new AuthError('Aucune session Spotify.')
  try {
    const data = await requestTokens({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    })
    storeTokens({
      accessToken: data.access_token,
      // Spotify may omit the refresh token: keep the current one.
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    })
    return data.access_token
  } catch (e) {
    if (e instanceof AuthError) logout()
    throw e
  }
}

// Concurrent callers share one request: a rotated refresh token must not be reused.
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = readTokens()
  if (!tokens) return null
  if (tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) return refreshAccessToken()
  return tokens.accessToken
}

export function logout(): void {
  localStorage.removeItem(TOKENS_KEY)
}
