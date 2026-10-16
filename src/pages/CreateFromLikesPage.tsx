import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import GenrePicker from '../components/GenrePicker'
import TrackPreview from '../components/TrackPreview'
import { useLibrarySyncState } from '../hooks/librarySyncContext'
import { db, type LikedTrack } from '../lib/db'
import { countByGenre, defaultPlaylistName, filterTracks, type TrackFilter } from '../lib/filter'
import type { GenreProfile } from '../lib/genres/classify'
import type { ParentId, SubId } from '../lib/genres/taxonomy'
import { addItemsToPlaylist, createPlaylist } from '../lib/spotify/api'

const DESCRIPTION = 'Créée par Spotifier depuis mes titres likés'
const MIN_YEAR = 1900
const currentYear = new Date().getFullYear()
const EMPTY_TRACKS: LikedTrack[] = []
const EMPTY_PROFILES: GenreProfile[] = []

const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`

/** The playlist exists on Spotify but adding the tracks failed. */
class IncompletePlaylistError extends Error {
  readonly playlistId: string
  constructor(playlistId: string, cause: unknown) {
    super('Playlist created but incomplete', { cause })
    this.playlistId = playlistId
  }
}

/** Empty = no bound (`undefined`); invalid = `null`. */
function parseYear(raw: string, max: number): number | undefined | null {
  if (raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= MIN_YEAR && n <= max ? n : null
}

const linkClass = 'font-bold underline'
const inputClass = 'w-28 rounded-md bg-elevated px-3 py-2 text-text'

export default function CreateFromLikesPage() {
  const sync = useLibrarySyncState()
  const queryClient = useQueryClient()

  const tracksQuery = useLiveQuery(() => db.likedTracks.toArray(), [])
  const profilesQuery = useLiveQuery(() => db.profiles.toArray(), [])
  const tracks = tracksQuery ?? EMPTY_TRACKS
  const profileList = profilesQuery ?? EMPTY_PROFILES
  const profiles = useMemo(() => new Map(profileList.map((p) => [p.trackId, p])), [profileList])
  const counts = useMemo(() => countByGenre(tracks, profiles), [tracks, profiles])

  const [parent, setParent] = useState<ParentId | null>(null)
  const [sub, setSub] = useState<SubId | undefined>()
  const [minRaw, setMinRaw] = useState('')
  const [maxRaw, setMaxRaw] = useState('')
  const [customName, setCustomName] = useState<string | null>(null)

  const yearMin = parseYear(minRaw, currentYear)
  const yearMax = parseYear(maxRaw, currentYear)
  let yearError: string | null = null
  if (yearMin === null || yearMax === null) {
    yearError = `Les années doivent être comprises entre ${MIN_YEAR} et ${currentYear}.`
  } else if (yearMin !== undefined && yearMax !== undefined && yearMin > yearMax) {
    yearError = 'L’année min doit être inférieure ou égale à l’année max.'
  }

  const minYear = yearMin ?? undefined
  const maxYear = yearMax ?? undefined
  const filter = useMemo<TrackFilter | null>(
    () => (parent ? { parent, sub, yearMin: minYear, yearMax: maxYear } : null),
    [parent, sub, minYear, maxYear],
  )
  const matches = useMemo(
    () => (filter ? filterTracks(tracks, profiles, filter) : EMPTY_TRACKS),
    [tracks, profiles, filter],
  )
  const name = customName ?? (filter ? defaultPlaylistName(filter) : '')
  const trimmedName = name.trim()

  // Synchronous guard: `isPending` only updates after a render, too late for a double click.
  const inFlight = useRef(false)
  const create = useMutation({
    mutationFn: async (input: { name: string; uris: string[] }) => {
      const playlist = await createPlaylist({ name: input.name, description: DESCRIPTION, isPublic: false })
      try {
        await addItemsToPlaylist(playlist.id, input.uris)
      } catch (err) {
        console.error(err)
        throw new IncompletePlaylistError(playlist.id, err)
      }
      return playlist
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
    onError: (e) => {
      if (e instanceof IncompletePlaylistError) void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const canCreate = !!filter && !yearError && matches.length > 0 && trimmedName !== '' && !create.isPending && !create.isSuccess
  const submit = () => {
    if (!canCreate || inFlight.current) return
    inFlight.current = true
    create.mutate({ name: trimmedName, uris: matches.map((t) => t.uri) })
  }

  const syncing = sync.phase === 'syncing' || sync.phase === 'analyzing'

  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold">Créer depuis mes likes</h1>

      {(syncing || sync.failed > 0) && (
        <p role="status" className="mb-6 rounded-lg bg-surface p-3 text-sm text-muted">
          {syncing
            ? `Analyse en cours (${sync.done}/${sync.total}) — les résultats peuvent être incomplets`
            : `${sync.failed} titres n'ont pas pu être analysés, ils seront retentés au prochain lancement`}
        </p>
      )}

      <div className="space-y-6">
        <GenrePicker
          parents={counts.parents}
          subs={counts.subs}
          parent={parent}
          sub={sub}
          disabled={create.isPending}
          onParent={(p) => {
            create.reset()
            setParent(p)
            setSub(undefined)
          }}
          onSub={(v) => {
            create.reset()
            setSub(v)
          }}
        />

        <fieldset disabled={create.isPending} className="flex flex-wrap items-start gap-4">
          <legend className="mb-2 text-sm font-semibold">Année de sortie (optionnel)</legend>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Année min</span>
            <input
              type="number"
              min={MIN_YEAR}
              max={currentYear}
              value={minRaw}
              onChange={(e) => {
                create.reset()
                setMinRaw(e.target.value)
              }}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Année max</span>
            <input
              type="number"
              min={MIN_YEAR}
              max={currentYear}
              value={maxRaw}
              onChange={(e) => {
                create.reset()
                setMaxRaw(e.target.value)
              }}
              className={inputClass}
            />
          </label>
        </fieldset>
        {yearError && (
          <p role="alert" className="text-sm text-danger">
            {yearError}
          </p>
        )}

        {filter && (
          <section aria-label="Aperçu">
            <h2 className="mb-2 text-xl font-bold">
              {matches.length} titre{matches.length > 1 ? 's' : ''}
            </h2>
            <TrackPreview tracks={matches} profiles={profiles} />
          </section>
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Nom de la playlist</span>
            <input
              type="text"
              value={name}
              disabled={create.isPending}
              onChange={(e) => {
                create.reset()
                setCustomName(e.target.value)
              }}
              className="w-full max-w-md rounded-md bg-elevated px-3 py-2 text-text"
            />
          </label>
          <button
            type="button"
            disabled={!canCreate}
            onClick={submit}
            className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-bg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Créer la playlist
          </button>

          {create.isSuccess && (
            <p role="status" className="text-sm">
              Playlist créée.{' '}
              <a href={playlistUrl(create.data.id)} target="_blank" rel="noreferrer" className={linkClass}>
                Ouvrir dans Spotify
              </a>
            </p>
          )}
          {create.isError && create.error instanceof IncompletePlaylistError && (
            <p role="alert" className="text-sm text-danger">
              La playlist a été créée mais est incomplète : l’ajout des titres a échoué.{' '}
              <a href={playlistUrl(create.error.playlistId)} target="_blank" rel="noreferrer" className={linkClass}>
                Ouvrir dans Spotify
              </a>
            </p>
          )}
          {create.isError && !(create.error instanceof IncompletePlaylistError) && (
            <p role="alert" className="text-sm text-danger">
              La création a échoué. Réessaie.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
