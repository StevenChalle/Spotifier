import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Logo from '../components/Logo'
import { AuthError, beginLogin, handleCallback } from '../lib/spotify/auth'

// handleCallback consumes the one-shot state/verifier: a StrictMode double mount
// must share one call per callback URL.
const attempts = new Map<string, Promise<void>>()

function runOnce(url: string): Promise<void> {
  let attempt = attempts.get(url)
  if (!attempt) {
    attempt = handleCallback(new URL(url))
    attempts.set(url, attempt)
  }
  return attempt
}

function messageFor(e: unknown): string {
  if (e instanceof AuthError) return e.message
  return 'Spotify est injoignable pour le moment. Vérifiez votre connexion puis réessayez.'
}

export default function CallbackPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    runOnce(window.location.href).then(
      () => {
        if (cancelled) return
        queryClient.removeQueries({ queryKey: ['me'] })
        navigate('/playlists', { replace: true })
      },
      (e: unknown) => {
        if (!cancelled) setError(messageFor(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [navigate, queryClient])

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 text-center">
        <Logo className="mb-6" />
        {error ? (
          <>
            <p role="alert" className="mb-6 text-sm text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void beginLogin()}
              className="w-full cursor-pointer rounded-full bg-accent px-8 py-3 font-bold text-bg transition hover:bg-accent-hover"
            >
              Réessayer la connexion
            </button>
          </>
        ) : (
          <p className="text-muted" role="status">
            Connexion en cours…
          </p>
        )}
      </div>
    </main>
  )
}
