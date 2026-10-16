import { config } from '../../config'
import { networkFetch } from '../errors'
import { createThrottle, sleep } from '../throttle'

const API_URL = 'https://ws.audioscrobbler.com/2.0/'
const REQUESTS_PER_SECOND = 4
const MAX_RATE_LIMIT_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1000

const ERROR_UNKNOWN_ITEM = 6
const ERROR_RATE_LIMIT = 29

export type WeightedTag = { name: string; count: number }

export class LastfmError extends Error {
  /** Last.fm error code, or 0 when the failure is an HTTP error without one. */
  code: number
  status?: number

  constructor(code: number, message: string, status?: number) {
    super(message)
    this.name = 'LastfmError'
    this.code = code
    this.status = status
  }
}

// One throttle for every Last.fm request of the module (retries included).
const throttle = createThrottle(REQUESTS_PER_SECOND)

type RawTag = { name?: unknown; count?: unknown }
type LastfmBody = {
  error?: number
  message?: string
  toptags?: { tag?: RawTag | RawTag[] }
}

async function fetchBody(url: string): Promise<{ body: LastfmBody | null; response: Response }> {
  const response = await throttle(() => networkFetch(url))
  let body: LastfmBody | null = null
  try {
    body = (await response.json()) as LastfmBody
  } catch {
    // Non-JSON body: the caller turns this into a LastfmError.
  }
  return { body, response }
}

async function request(params: Record<string, string>): Promise<WeightedTag[]> {
  const query = new URLSearchParams({
    ...params,
    format: 'json',
    autocorrect: '1',
    api_key: config.lastfmApiKey,
  })
  const url = `${API_URL}?${query.toString()}`

  for (let attempt = 0; ; attempt++) {
    const { body, response } = await fetchBody(url)

    if (body === null) {
      throw new LastfmError(0, `Last.fm: non-JSON response (HTTP ${response.status})`, response.status)
    }
    if (typeof body.error === 'number') {
      if (body.error === ERROR_UNKNOWN_ITEM) return []
      if (body.error === ERROR_RATE_LIMIT && attempt < MAX_RATE_LIMIT_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt) // 1 s, 2 s, 4 s
        continue
      }
      throw new LastfmError(body.error, body.message ?? `Last.fm error ${body.error}`, response.status)
    }
    if (!response.ok) {
      throw new LastfmError(0, `Last.fm HTTP ${response.status}`, response.status)
    }
    return parseTags(body)
  }
}

function parseTags(body: LastfmBody): WeightedTag[] {
  const raw = body.toptags?.tag
  if (!raw) return []
  // Last.fm returns a bare object instead of an array when there is a single tag.
  const list = Array.isArray(raw) ? raw : [raw]
  const tags: WeightedTag[] = []
  for (const item of list) {
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) continue
    const count = Number(item.count)
    tags.push({ name, count: Number.isFinite(count) ? count : 0 })
  }
  return tags
}

export function getTrackTopTags(artist: string, track: string): Promise<WeightedTag[]> {
  return request({ method: 'track.gettoptags', artist, track })
}

export function getArtistTopTags(artist: string): Promise<WeightedTag[]> {
  return request({ method: 'artist.gettoptags', artist })
}

// Known noise suffixes only: a legitimate dash ("Tout - Rien") must survive.
const TITLE_SUFFIXES: RegExp[] = [
  /\s+-\s+(?:\d{4}\s+)?Remaster(?:ed)?\b.*$/i,
  /\s+-\s+Live\b.*$/i,
  /\s+-\s+Radio Edit$/i,
  /\s+-\s+Single Version$/i,
  /\s+-\s+(?:Mono|Stereo)\b.*$/i,
  /\s*[([]\s*feat\.[^)\]]*[)\]]$/i,
]

export function cleanTrackTitle(title: string): string {
  let cleaned = title.trim()
  let previous: string
  do {
    previous = cleaned
    for (const suffix of TITLE_SUFFIXES) cleaned = cleaned.replace(suffix, '').trim()
  } while (cleaned !== previous)
  return cleaned || title.trim()
}
