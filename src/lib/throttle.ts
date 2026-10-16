export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Returns a function that runs `fn` no sooner than `1000 / perSecond` ms after the
 * previous start. Starts are therefore evenly spaced, which guarantees at most
 * `perSecond` starts in any sliding 1 s window. Calls start in FIFO order.
 */
export function createThrottle(perSecond: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const intervalMs = 1000 / perSecond
  let nextSlot = 0

  return async function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()
    // The slot is reserved synchronously, so concurrent callers never share one.
    const start = Math.max(now, nextSlot)
    nextSlot = start + intervalMs
    if (start > now) await sleep(start - now)
    return fn()
  }
}
