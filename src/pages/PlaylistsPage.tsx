import { useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import PlaylistCard from '../components/PlaylistCard'
import RenameDialog from '../components/RenameDialog'
import { useAuth } from '../hooks/useAuth'
import { usePlaylists } from '../hooks/usePlaylists'
import type { SpotifyPlaylist } from '../lib/spotify/types'

export default function PlaylistsPage() {
  const { user } = useAuth()
  const { query, rename, remove } = usePlaylists()
  // Last targeted playlists are kept after closing so the dialogs never render an empty name.
  const [renaming, setRenaming] = useState<SpotifyPlaylist | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleting, setDeleting] = useState<SpotifyPlaylist | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.uri)
    setDeleteOpen(false)
  }
  const submitRename = (name: string) => {
    if (!renaming) return
    rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenameOpen(false) })
  }
  const closeRename = () => {
    setRenameOpen(false)
    rename.reset()
  }

  // The delete dialog closes at once; progress and failure are shown on the card.
  // While a deletion is pending every action is disabled, so deletions never overlap.
  const failedUri = remove.isError ? remove.variables : undefined

  let content
  if (query.isPending) {
    content = (
      <ul aria-label="Chargement des playlists" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} aria-hidden="true" className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
        ))}
      </ul>
    )
  } else if (query.isError) {
    content = (
      <div>
        <p role="alert" className="mb-4 text-danger">
          Impossible de charger tes playlists.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-bg transition hover:bg-accent-hover"
        >
          Réessayer
        </button>
      </div>
    )
  } else if (query.data.length === 0) {
    content = <p className="text-muted">Aucune playlist dans ta bibliothèque.</p>
  } else {
    content = (
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {query.data.map((p) => (
          <PlaylistCard
            key={p.id}
            playlist={p}
            isOwner={p.owner.id === user?.id}
            busy={remove.isPending}
            error={failedUri === p.uri ? 'La suppression a échoué. Réessaie.' : null}
            onRename={() => {
              rename.reset()
              setRenaming(p)
              setRenameOpen(true)
            }}
            onDelete={() => {
              remove.reset()
              setDeleting(p)
              setDeleteOpen(true)
            }}
          />
        ))}
      </ul>
    )
  }

  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold">Mes playlists</h1>
      {content}
      <RenameDialog
        open={renameOpen}
        currentName={renaming?.name ?? ''}
        pending={rename.isPending}
        error={rename.isError ? 'Le renommage a échoué. Réessaie.' : null}
        onSubmit={submitRename}
        onCancel={closeRename}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Supprimer la playlist"
        message={`Retirer "${deleting?.name ?? ''}" de ta bibliothèque ?`}
        confirmLabel="Supprimer"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  )
}
