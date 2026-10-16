import { Navigate, Outlet, useNavigate } from 'react-router'
import { useAuth, type AuthUser } from '../hooks/useAuth'
import { LibrarySyncContext } from '../hooks/librarySyncContext'
import { useLibrarySync } from '../hooks/useLibrarySync'
import Sidebar from './Sidebar'

function Shell({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  // Mounted only once authenticated: the sync starts with the app shell.
  const sync = useLibrarySync()
  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <Sidebar user={user} sync={sync} onLogout={onLogout} />
      <main className="min-w-0 bg-gradient-to-b from-elevated/40 to-bg px-4 py-6 md:px-10 md:py-8">
        <LibrarySyncContext.Provider value={sync}>
          <Outlet />
        </LibrarySyncContext.Provider>
      </main>
    </div>
  )
}

export default function Layout() {
  const { status, user, logout, retry } = useAuth()
  const navigate = useNavigate()

  if (status === 'loading') {
    return (
      <p role="status" className="p-8 text-muted">
        Chargement…
      </p>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />
  const onLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }
  if (status === 'error' || !user) {
    return (
      <div className="p-8">
        <p role="alert" className="mb-4 text-danger">
          Impossible de joindre Spotify.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void retry()}
            className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-bg transition hover:bg-accent-hover"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="cursor-pointer text-muted underline transition hover:text-text"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }
  return <Shell user={user} onLogout={onLogout} />
}
