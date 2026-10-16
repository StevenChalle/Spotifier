import { useState } from 'react'
import Logo from '../components/Logo'
import { beginLogin } from '../lib/spotify/auth'

export default function LoginPage() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  function connect() {
    setBusy(true)
    setFailed(false)
    beginLogin().catch(() => {
      setBusy(false)
      setFailed(true)
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-elevated to-bg px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 text-center shadow-2xl">
        <Logo className="mb-6" />
        <h1 className="mb-2 text-2xl font-bold">Vos likes, triés par genre</h1>
        <p className="mb-8 text-sm text-muted">
          Créez des playlists à partir de vos titres likés, par genre et par époque.
        </p>
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="w-full cursor-pointer rounded-full bg-accent px-8 py-3.5 text-base font-bold text-bg transition hover:scale-[1.02] hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
        >
          Se connecter avec Spotify
        </button>
        {failed && (
          <p role="alert" className="mt-4 text-sm text-danger">
            Impossible de lancer la connexion. Réessayez.
          </p>
        )}
      </div>
    </main>
  )
}
