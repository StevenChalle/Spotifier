import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SyncStatus from '../../src/components/SyncStatus'
import type { LibrarySync } from '../../src/hooks/useLibrarySync'

afterEach(cleanup)

const base: LibrarySync = {
  phase: 'idle', done: 5, total: 10, classified: 3, unclassified: 2, failed: 0, error: null,
  resync: () => {}, retry: () => {},
}

describe('SyncStatus', () => {
  it('offers Réessayer when titles are left to retry and calls retry()', async () => {
    const retry = vi.fn()
    const resync = vi.fn()
    render(<SyncStatus sync={{ ...base, failed: 4, retry, resync }} />)
    expect(screen.getByText('4 titres à réessayer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(resync).not.toHaveBeenCalled()
  })

  it('hides Réessayer when nothing failed or while a run is in progress', () => {
    const { rerender } = render(<SyncStatus sync={base} />)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    rerender(<SyncStatus sync={{ ...base, phase: 'analyzing', failed: 4 }} />)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })
})
