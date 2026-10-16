import { createContext, useContext } from 'react'
import type { LibrarySync } from './useLibrarySync'

/** Sync state of the single `useLibrarySync()` instance mounted by `Layout`. */
export const LibrarySyncContext = createContext<LibrarySync | null>(null)

export function useLibrarySyncState(): LibrarySync {
  const sync = useContext(LibrarySyncContext)
  if (!sync) throw new Error('useLibrarySyncState must be used inside <Layout>')
  return sync
}
