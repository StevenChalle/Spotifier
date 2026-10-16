import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/config', () => ({ config: { lastfmApiKey: 'test-key' } }))

type Client = typeof import('../../../src/lib/lastfm/client')
let client: Client
let LastfmError: Client['LastfmError']
let cleanTrackTitle: Client['cleanTrackTitle']
let getArtistTopTags: Client['getArtistTopTags']
let getTrackTopTags: Client['getTrackTopTags']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const fetchMock = vi.fn()

beforeEach(async () => {
  vi.useFakeTimers()
  // The module owns a shared throttle: reload it so each test starts with a clean clock.
  vi.resetModules()
  client = await import('../../../src/lib/lastfm/client')
  ;({ LastfmError, cleanTrackTitle, getArtistTopTags, getTrackTopTags } = client)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Runs the fake clock forward until the promise settles (handlers attached first). */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(60_000)
  const result = await outcome
  if ('error' in result) throw result.error
  return result.value
}

describe('getTrackTopTags', () => {
  it('parses toptags.tag and calls the expected URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        toptags: {
          tag: [
            { name: 'rock', count: 100 },
            { name: 'classic rock', count: '57' },
          ],
        },
      }),
    )
    const tags = await settle(getTrackTopTags('The Beatles', 'Come Together'))
    expect(tags).toEqual([
      { name: 'rock', count: 100 },
      { name: 'classic rock', count: 57 },
    ])
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('https://ws.audioscrobbler.com/2.0/')
    expect(url.searchParams.get('method')).toBe('track.gettoptags')
    expect(url.searchParams.get('artist')).toBe('The Beatles')
    expect(url.searchParams.get('track')).toBe('Come Together')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('autocorrect')).toBe('1')
    expect(url.searchParams.get('api_key')).toBe('test-key')
  })

  it('handles a single tag returned as an object, not an array', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ toptags: { tag: { name: 'jazz', count: 3 } } }))
    expect(await settle(getTrackTopTags('A', 'B'))).toEqual([{ name: 'jazz', count: 3 }])
  })

  it('returns [] when there is no tag and ignores empty tag names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ toptags: {} }))
    expect(await settle(getTrackTopTags('A', 'B'))).toEqual([])
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        toptags: {
          tag: [
            { name: '', count: 5 },
            { name: '  ', count: 2 },
            { name: 'pop', count: 1 },
          ],
        },
      }),
    )
    expect(await settle(getTrackTopTags('A', 'B'))).toEqual([{ name: 'pop', count: 1 }])
  })

  it('error 6 returns empty tags', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 6, message: 'Track not found' }))
    expect(await settle(getTrackTopTags('Nobody', 'Nothing'))).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('error 6 returned with an HTTP 404 status still yields []', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 6, message: 'not found' }, 404))
    expect(await settle(getTrackTopTags('Nobody', 'Nothing'))).toEqual([])
  })

  it('error 29 retries (waits, then succeeds)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 29, message: 'Rate limit exceeded' }))
      .mockResolvedValueOnce(jsonResponse({ toptags: { tag: [{ name: 'rock', count: 1 }] } }))
    const outcome = getTrackTopTags('A', 'B')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500) // backoff is 1 s: not retried yet
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(await outcome).toEqual([{ name: 'rock', count: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('error 29 gives up after 3 retries with a LastfmError', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 29, message: 'Rate limit exceeded' }))
    const error = await settle(getTrackTopTags('A', 'B')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LastfmError)
    expect((error as InstanceType<Client['LastfmError']>).code).toBe(29)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws LastfmError for any other Last.fm error', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 10, message: 'Invalid API key' }))
    const error = await settle(getTrackTopTags('A', 'B')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LastfmError)
    expect((error as InstanceType<Client['LastfmError']>).code).toBe(10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws LastfmError on an HTTP error without a Last.fm error body', async () => {
    fetchMock.mockImplementation(async () => new Response('Bad gateway', { status: 502 }))
    const error = await settle(getTrackTopTags('A', 'B')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LastfmError)
    expect((error as InstanceType<Client['LastfmError']>).status).toBe(502)
  })

  it('wraps a rejected fetch in a NetworkError with its cause', async () => {
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)
    const error = await settle(getTrackTopTags('A', 'B')).catch((e: unknown) => e)
    const { NetworkError } = await import('../../../src/lib/errors')
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as Error).cause).toBe(cause)
  })

  it('200 with non-JSON body throws LastfmError', async () => {
    fetchMock.mockImplementation(async () => new Response('<html>oops</html>', { status: 200 }))
    const error = await settle(getTrackTopTags('A', 'B')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LastfmError)
    expect((error as InstanceType<Client['LastfmError']>).code).toBe(0)
    expect((error as InstanceType<Client['LastfmError']>).status).toBe(200)
  })

  it('round-trips atypical artist names through the query string', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ toptags: { tag: [] } }))
    const names = ['AC/DC', 'Simon & Garfunkel', 'Sigur Rós']
    await settle(Promise.all(names.map((n) => getArtistTopTags(n))))
    const sent = fetchMock.mock.calls.map((c) => new URL(c[0] as string).searchParams.get('artist'))
    expect(sent).toEqual(names)
  })

  it('shares one 4/s throttle across track and artist requests', async () => {
    const t0 = Date.now()
    const starts: number[] = []
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now() - t0)
      return jsonResponse({ toptags: { tag: [] } })
    })
    const calls = [
      ...Array.from({ length: 4 }, (_, i) => getTrackTopTags('A', `T${i}`)),
      ...Array.from({ length: 4 }, () => getArtistTopTags('A')),
    ]
    await settle(Promise.all(calls))
    expect(starts).toHaveLength(8)
    expect(starts[7] - starts[0]).toBeGreaterThanOrEqual(1750)
  })

  it('sends a retry through the throttle too', async () => {
    const t0 = Date.now()
    const starts: number[] = []
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now() - t0)
      // Every request is rate-limited once, then the retry would succeed.
      return starts.length <= 4
        ? jsonResponse({ error: 29, message: 'Rate limit exceeded' })
        : jsonResponse({ toptags: { tag: [] } })
    })
    const calls = Array.from({ length: 4 }, (_, i) => getTrackTopTags('A', `T${i}`))
    await settle(Promise.all(calls))
    expect(starts).toHaveLength(8)
    for (let i = 0; i + 4 < starts.length; i++) {
      expect(starts[i + 4] - starts[i]).toBeGreaterThanOrEqual(1000)
    }
  })
})

describe('getArtistTopTags', () => {
  it('uses artist.gettoptags and parses tags', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ toptags: { tag: [{ name: 'electronic', count: 100 }] } }),
    )
    expect(await settle(getArtistTopTags('Daft Punk'))).toEqual([
      { name: 'electronic', count: 100 },
    ])
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('method')).toBe('artist.gettoptags')
    expect(url.searchParams.get('artist')).toBe('Daft Punk')
    expect(url.searchParams.has('track')).toBe(false)
  })

  it('error 6 returns empty tags', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 6, message: 'Artist not found' }))
    expect(await settle(getArtistTopTags('Zzz'))).toEqual([])
  })
})

describe('cleanTrackTitle', () => {
  it('strips remaster suffixes', () => {
    expect(cleanTrackTitle('Come Together - Remastered 2009')).toBe('Come Together')
    expect(cleanTrackTitle('Come Together - Remaster')).toBe('Come Together')
    expect(cleanTrackTitle('Come Together - 2009 Remaster')).toBe('Come Together')
  })

  it('strips feat. suffixes in parentheses and brackets', () => {
    expect(cleanTrackTitle('Song (feat. X)')).toBe('Song')
    expect(cleanTrackTitle('Song [feat. X & Y]')).toBe('Song')
  })

  it('strips live / radio edit / single version / mono-stereo suffixes', () => {
    expect(cleanTrackTitle('Song - Live at Wembley 1986')).toBe('Song')
    expect(cleanTrackTitle('Song - Radio Edit')).toBe('Song')
    expect(cleanTrackTitle('Song - Single Version')).toBe('Song')
    expect(cleanTrackTitle('Song - Mono Version')).toBe('Song')
    expect(cleanTrackTitle('Song - Stereo Mix')).toBe('Song')
  })

  it('strips stacked suffixes', () => {
    expect(cleanTrackTitle('Song (feat. X) - Remastered 2011')).toBe('Song')
  })

  it('keeps legitimate dashes and unrelated parentheses intact', () => {
    expect(cleanTrackTitle('Tout - Rien')).toBe('Tout - Rien')
    expect(cleanTrackTitle('Stay (with Me)')).toBe('Stay (with Me)')
    expect(cleanTrackTitle('Song (Part 2)')).toBe('Song (Part 2)')
    expect(cleanTrackTitle('Alive - Tonight')).toBe('Alive - Tonight')
    expect(cleanTrackTitle('Plain Title')).toBe('Plain Title')
  })

  it('never returns an empty title', () => {
    expect(cleanTrackTitle('(feat. X)')).toBe('(feat. X)')
  })
})
