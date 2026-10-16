import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { LibrarySync } from '../hooks/useLibrarySync'

function statusLabel(sync: LibrarySync): string {
  switch (sync.phase) {
    case 'syncing':
      return 'Lecture de vos likes…'
    case 'analyzing':
      return 'Analyse des genres…'
    case 'done':
      return 'Bibliothèque à jour'
    case 'error':
      return sync.error ?? 'Erreur de synchronisation'
    default:
      return sync.failed > 0 ? `${sync.failed} titres à réessayer` : 'En attente'
  }
}

export default function SyncStatus({ sync }: { sync: LibrarySync }) {
  const [confirming, setConfirming] = useState(false)
  const percent = sync.total > 0 ? Math.min(100, Math.round((sync.done / sync.total) * 100)) : 0
  const busy = sync.phase === 'syncing' || sync.phase === 'analyzing'

  return (
    <section aria-label="État de la synchronisation" className="rounded-lg bg-surface p-3 text-sm">
      <p className={sync.phase === 'error' ? 'font-semibold text-danger' : 'font-semibold'}>
        {statusLabel(sync)}
      </p>
      <div
        role="progressbar"
        aria-label="Progression"
        aria-valuemin={0}
        aria-valuemax={sync.total}
        aria-valuenow={sync.done}
        className="my-2 h-1 overflow-hidden rounded-full bg-elevated"
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-muted">
        {sync.done} / {sync.total} titres
      </p>
      <p className="text-muted">
        {sync.classified} classés · {sync.unclassified} non classés
      </p>
      {sync.failed > 0 && !busy && (
        <button
          type="button"
          onClick={sync.retry}
          className="mt-2 mr-3 cursor-pointer font-semibold text-accent underline transition hover:text-accent-hover"
        >
          Réessayer
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 cursor-pointer text-muted underline transition hover:text-text"
      >
        Resynchroniser
      </button>

      <ConfirmDialog
        open={confirming}
        title="Resynchroniser la bibliothèque ?"
        message={`Tous les genres seront effacés puis réanalysés depuis Last.fm. Cela prend environ 20 à 25 minutes pour 4 300 titres ; l’application reste utilisable pendant ce temps.${busy ? ' L’analyse en cours sera interrompue.' : ''}`}
        confirmLabel="Tout réanalyser"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          sync.resync()
        }}
      />
    </section>
  )
}
