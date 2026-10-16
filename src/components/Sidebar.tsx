import { NavLink } from 'react-router'
import type { AuthUser } from '../hooks/useAuth'
import type { LibrarySync } from '../hooks/useLibrarySync'
import Logo from './Logo'
import SyncStatus from './SyncStatus'

const LINKS = [
  { to: '/playlists', label: 'Mes playlists' },
  { to: '/create', label: 'Créer depuis mes likes' },
]

function linkClass({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-3 py-2 text-sm font-bold transition md:text-base ${
    isActive ? 'bg-elevated text-text' : 'text-muted hover:text-text'
  }`
}

type Props = { user: AuthUser; sync: LibrarySync; onLogout: () => void }

export default function Sidebar({ user, sync, onLogout }: Props) {
  return (
    <aside className="flex flex-wrap items-center gap-x-2 gap-y-3 bg-black p-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:flex-nowrap md:gap-y-4 md:p-5">
      <Logo className="mr-auto md:mb-4 md:mr-0 md:px-3" />
      <nav aria-label="Navigation" className="order-3 flex w-full gap-1 md:order-none md:w-auto md:flex-col">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={linkClass}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="order-4 w-full md:order-none md:mt-auto">
        <SyncStatus sync={sync} />
      </div>
      <div className="flex items-center gap-3 md:order-none md:justify-between md:px-1">
        <span className="max-w-32 truncate text-sm font-semibold md:max-w-none" title={user.name}>
          {user.name}
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="cursor-pointer text-sm text-muted underline transition hover:text-text"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
