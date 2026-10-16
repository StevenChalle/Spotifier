import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { db } from '../lib/db'
import { countByGenre } from '../lib/filter'
import { LastfmError } from '../lib/lastfm/client'
import { AuthError } from '../lib/spotify/auth'
import { forceResync, pendingTrackIds, runAnalysis, syncLikedTracks } from '../lib/sync'
import { useAuth } from './useAuth'

export type SyncPhase = 'idle' | 'syncing' | 'analyzing' | 'done' | 'error'

export type LibrarySync = {
  phase: SyncPhase
  done: number
  total: number
  classified: number
  unclassified: number
  /** Tracks left pending by transient errors; retried at the next launch. */
  failed: number
  error: string | null
  resync(): void
  /** Sync + analysis again, keeping what is already classified (no forced reset). */
  retry(): void
}

// Counts re-read the whole library: keep them rare while the analysis runs.
const COUNTS_REFRESH_MS = 2500
const FATAL_LASTFM_CODES = new Set([10, 26])

// Module-level singleton: whatever the number of mounts (StrictMode, route changes),
// runs execute one at a time, each waiting for the previous (aborted) one to finish.
let currentController: AbortController | null = null
let queue: Promise<void> = Promise.resolve()

async function readCounts(): Promise<{ classified: number; unclassified: number }> {
  const [tracks, profiles] = await Promise.all([db.likedTracks.toArray(), db.profiles.toArray()])
  const byId = new Map(profiles.map((p) => [p.trackId, p]))
  const analyzed = tracks.filter((t) => byId.has(t.id)).length
  const { unclassified } = countByGenre(tracks, byId)
  return { classified: analyzed - unclassified, unclassified }
}

export function useLibrarySync(): LibrarySync {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [state, setState] = useState<Omit<LibrarySync, 'resync' | 'retry'>>({
    phase: 'idle',
    done: 0,
    total: 0,
    classified: 0,
    unclassified: 0,
    failed: 0,
    error: null,
  })
  const mine = useRef<AbortController | null>(null)
  const onAuthLost = useRef(() => {})
  useEffect(() => {
    onAuthLost.current = () => {
      logout()
      navigate('/login', { replace: true })
    }
  }, [logout, navigate])

  const start = useCallback((force: boolean): AbortController => {
    currentController?.abort()
    const controller = new AbortController()
    currentController = controller
    const { signal } = controller
    const patch = (p: Partial<Omit<LibrarySync, 'resync' | 'retry'>>) => {
      if (!signal.aborted) setState((s) => ({ ...s, ...p }))
    }
    const refreshCounts = () =>
      readCounts()
        .then(patch)
        .catch((e: unknown) => console.error(e))

    const body = async () => {
      if (signal.aborted) return
      try {
        if (force) await forceResync()
        patch({ phase: 'syncing', done: 0, total: 0, failed: 0, error: null })
        await refreshCounts()
        if (signal.aborted) return
        await syncLikedTracks((loaded, total) => patch({ done: loaded, total }))
        if (signal.aborted) return

        // Resumed analysis: count the already profiled tracks as done.
        const [liked, pending] = await Promise.all([db.likedTracks.count(), pendingTrackIds()])
        const offset = liked - pending.length
        patch({ phase: 'analyzing', done: offset, total: liked })
        await refreshCounts()

        let lastRefresh = Date.now()
        const { failed } = await runAnalysis({
          signal,
          onProgress: (d, t) => {
            patch({ done: offset + d, total: offset + t })
            if (Date.now() - lastRefresh >= COUNTS_REFRESH_MS) {
              lastRefresh = Date.now()
              void refreshCounts()
            }
          },
        })
        if (signal.aborted) return
        await refreshCounts()
        // 'done' only when nothing is left pending; otherwise stay idle with `failed` set.
        patch({ phase: failed === 0 ? 'done' : 'idle', failed })
      } catch (e) {
        if (signal.aborted) return
        if (e instanceof AuthError) {
          onAuthLost.current()
        } else if (e instanceof LastfmError && FATAL_LASTFM_CODES.has(e.code)) {
          patch({ phase: 'error', error: 'Clé API Last.fm invalide' })
        } else {
          console.error(e)
          patch({
            phase: 'error',
            error: 'La synchronisation a échoué. Rechargez la page pour reprendre.',
          })
        }
        void refreshCounts()
      }
    }

    // A rejection must never block the following runs.
    queue = queue.then(body).catch((e: unknown) => console.error(e))
    mine.current = controller
    return controller
  }, [])

  useEffect(() => {
    start(false)
    return () => mine.current?.abort()
  }, [start])

  const resync = useCallback(() => {
    start(true)
  }, [start])

  const retry = useCallback(() => {
    start(false)
  }, [start])

  return { ...state, resync, retry }
}
