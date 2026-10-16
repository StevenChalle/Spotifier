/** A `fetch()` call rejected (offline, DNS, CORS...): transient, as opposed to a bug in our own code. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

/** `fetch()` that turns a rejection into a `NetworkError` (HTTP error statuses still resolve normally). */
export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (cause) {
    throw new NetworkError('Erreur réseau.', { cause })
  }
}
