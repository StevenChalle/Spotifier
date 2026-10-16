import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThrottle } from '../../src/lib/throttle'

describe('createThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the 8th of 8 calls at least 1750 ms after the 1st (4/s)', async () => {
    const throttle = createThrottle(4)
    const starts: number[] = []
    const t0 = Date.now()
    const calls = Array.from({ length: 8 }, () =>
      throttle(async () => {
        starts.push(Date.now() - t0)
      }),
    )
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all(calls)
    expect(starts).toHaveLength(8)
    expect(starts[7] - starts[0]).toBeGreaterThanOrEqual(1750)
  })

  it('never starts more than 4 calls in any sliding 1 s window', async () => {
    const throttle = createThrottle(4)
    const starts: number[] = []
    const t0 = Date.now()
    const calls = Array.from({ length: 12 }, () =>
      throttle(async () => {
        starts.push(Date.now() - t0)
      }),
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await Promise.all(calls)
    for (let i = 0; i + 4 < starts.length; i++) {
      // The 5th start after starts[i] must fall at least 1 s later.
      expect(starts[i + 4] - starts[i]).toBeGreaterThanOrEqual(1000)
    }
  })

  it('returns the result and propagates rejections', async () => {
    const throttle = createThrottle(4)
    const ok = throttle(async () => 42)
    const failing = throttle(() => Promise.reject(new Error('boom')))
    const failed = expect(failing).rejects.toThrow('boom')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(ok).resolves.toBe(42)
    await failed
  })
})
