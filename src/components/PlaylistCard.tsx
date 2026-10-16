import type { SpotifyPlaylist } from '../lib/spotify/types'

type Props = {
  playlist: SpotifyPlaylist
  isOwner: boolean
  busy: boolean
  error: string | null
  onRename: () => void
  onDelete: () => void
}

const actionClass =
  'cursor-pointer rounded-full px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50'

export default function PlaylistCard({ playlist, isOwner, busy, error, onRename, onDelete }: Props) {
  const image = playlist.images?.[0]
  const total = playlist.items?.total
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface p-4 transition hover:bg-elevated">
      <a
        href={`https://open.spotify.com/playlist/${playlist.id}`}
        target="_blank"
        rel="noopener"
        className="block"
      >
        {image ? (
          <img src={image.url} alt="" className="mb-3 aspect-square w-full rounded-md object-cover" />
        ) : (
          <div aria-hidden="true" className="mb-3 aspect-square w-full rounded-md bg-elevated" />
        )}
        <h2 className="truncate font-bold" title={playlist.name}>
          {playlist.name}
        </h2>
        {total !== undefined && (
          <p className="text-sm text-muted">
            {total} titre{total > 1 ? 's' : ''}
          </p>
        )}
      </a>
      <p className="truncate text-sm text-muted">Par {isOwner ? 'toi' : playlist.owner.id}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-auto flex gap-2">
        {isOwner && (
          <button
            type="button"
            disabled={busy}
            onClick={onRename}
            className={`${actionClass} bg-elevated text-text hover:bg-bg`}
          >
            Renommer
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className={`${actionClass} text-danger hover:underline`}
        >
          Supprimer
        </button>
      </div>
    </li>
  )
}
