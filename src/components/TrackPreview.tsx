import type { LikedTrack } from '../lib/db'
import { releaseYear } from '../lib/filter'
import type { GenreProfile, GenreSource } from '../lib/genres/classify'

export const PREVIEW_LIMIT = 200

const SOURCE_LABEL: Partial<Record<GenreSource, string>> = {
  'lastfm-track': 'titre',
  'lastfm-artist': 'artiste',
  'spotify-artist': 'Spotify',
}

type Props = { tracks: LikedTrack[]; profiles: Map<string, GenreProfile> }

export default function TrackPreview({ tracks, profiles }: Props) {
  const shown = tracks.slice(0, PREVIEW_LIMIT)
  const hidden = tracks.length - shown.length
  return (
    <div>
      <ul className="divide-y divide-elevated/60">
        {shown.map((t) => {
          const source = SOURCE_LABEL[profiles.get(t.id)?.source ?? 'none']
          return (
            <li key={t.id} className="flex items-center gap-3 py-2">
              {t.imageUrl ? (
                <img src={t.imageUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded object-cover" />
              ) : (
                <div aria-hidden="true" className="size-10 shrink-0 rounded bg-elevated" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="truncate text-sm text-muted">{t.artists.map((a) => a.name).join(', ')}</p>
              </div>
              <span className="text-sm text-muted">{releaseYear(t.releaseDate) ?? '—'}</span>
              {source && <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">{source}</span>}
            </li>
          )
        })}
      </ul>
      {hidden > 0 && <p className="py-2 text-sm text-muted">… et {hidden} autres</p>}
    </div>
  )
}
