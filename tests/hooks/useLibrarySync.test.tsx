import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeAuthError, FakeLastfmError } = vi.hoisted(() => ({
  FakeAuthError: class extends Error {},
  FakeLastfmError: class extends Error {
    code: number
    constructor(code: number) {
      super('lastfm')
      this.code = code
    }
  },
}))

const runAnalysis = vi.fn()
const syncLikedTracks = vi.fn()
const logout = vi.fn()
const forceResync = vi.fn()
vi.mock('../../src/lib/sync', () => ({
  syncLikedTracks: (...a: unknown[]) => syncLikedTracks(...a),
  runAnalysis: (...a: unknown[]) => runAnalysis(...a),
  forceResync: () => forceResync(),
  pendingTrackIds: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../src/lib/spotify/auth', () => ({
  AuthError: FakeAuthError,
  getValidAccessToken: () => Promise.resolve('token'),
  logout: () => logout(),
}))
vi.mock('../../src/lib/spotify/api', () => ({
  getMe: () => Promise.resolve({ id: 'u', display_name: 'U' }),
}))
vi.mock('../../src/lib/lastfm/client', () => ({ LastfmError: FakeLastfmError }))

import { useLibrarySync } from '../../src/hooks/useLibrarySync'

const queryClient = new QueryClient()

function Probe() {
  return <span data-testid="path">{useLocation().pathname}</span>
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/playlists']}>
        {children}
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  syncLikedTracks.mockResolvedValue({ added: 0, removed: 0 })
  forceResync.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useLibrarySync', () => {
  it('reaches done when nothing failed', async () => {
    runAnalysis.mockResolvedValue({ failed: 0 })
    const { result } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('done'))
  })

  it('does not report done when titles are left to retry', async () => {
    runAnalysis.mockResolvedValue({ failed: 3 })
    const { result } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(3))
    expect(result.current.phase).toBe('idle')
  })

  it('retry runs sync and analysis again without forceResync', async () => {
    runAnalysis.mockResolvedValueOnce({ failed: 2 }).mockResolvedValueOnce({ failed: 0 })
    const { result } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(2))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.phase).toBe('done'))
    expect(syncLikedTracks).toHaveBeenCalledTimes(2)
    expect(runAnalysis).toHaveBeenCalledTimes(2)
    expect(forceResync).not.toHaveBeenCalled()
    expect(result.current.failed).toBe(0)
  })

  it('reports an invalid Last.fm key', async () => {
    runAnalysis.mockRejectedValue(new FakeLastfmError(10))
    const { result } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBe('Clé API Last.fm invalide')
  })

  it('logs out and navigates to /login on AuthError', async () => {
    runAnalysis.mockRejectedValue(new FakeAuthError('x'))
    renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(logout).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'))
  })

  it('resync aborts, waits for the running analysis to finish, then forceResync and a new run', async () => {
    const order: string[] = []
    const first = deferred()
    const signals: AbortSignal[] = []
    const progress: Array<(d: number, t: number) => void> = []
    runAnalysis.mockImplementationOnce(async (opts: { signal: AbortSignal; onProgress: (d: number, t: number) => void }) => {
      signals.push(opts.signal)
      progress.push(opts.onProgress)
      await first.promise
      order.push('analysis-1-ended')
      return { failed: 0 }
    })
    runAnalysis.mockImplementationOnce(async () => {
      order.push('analysis-2')
      return { failed: 0 }
    })
    forceResync.mockImplementation(async () => {
      order.push('forceResync')
    })

    const { result } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(signals).toHaveLength(1))

    act(() => result.current.resync())
    expect(signals[0].aborted).toBe(true)
    await new Promise((r) => setTimeout(r, 30))
    expect(forceResync).not.toHaveBeenCalled() // still waiting for run 1

    // Stale progress from the aborted run is ignored.
    act(() => progress[0](5, 10))
    expect(result.current.done).not.toBe(5)

    first.resolve()
    await waitFor(() => expect(result.current.phase).toBe('done'))
    expect(order).toEqual(['analysis-1-ended', 'forceResync', 'analysis-2'])
  })

  it('aborts the signal on unmount during the analysis', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gate = deferred()
    const signals: AbortSignal[] = []
    runAnalysis.mockImplementationOnce(async (opts: { signal: AbortSignal; onProgress: (d: number, t: number) => void }) => {
      signals.push(opts.signal)
      await gate.promise
      opts.onProgress(1, 2)
      return { failed: 0 }
    })
    const { result, unmount } = renderHook(() => useLibrarySync(), { wrapper })
    await waitFor(() => expect(signals).toHaveLength(1))
    const before = result.current
    unmount()
    expect(signals[0].aborted).toBe(true)
    gate.resolve()
    await new Promise((r) => setTimeout(r, 30))
    expect(result.current).toBe(before)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
