import { TAXONOMY, type ParentId, type SubId } from '../lib/genres/taxonomy'

type Props = {
  parents: Record<ParentId, number>
  subs: Record<SubId, number>
  parent: ParentId | null
  sub: SubId | undefined
  onParent(parent: ParentId): void
  onSub(sub: SubId | undefined): void
  disabled?: boolean
}

export default function GenrePicker({ parents, subs, parent, sub, onParent, onSub, disabled = false }: Props) {
  const entry = TAXONOMY.find((e) => e.id === parent)
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Genre" className="flex flex-wrap gap-2">
        {TAXONOMY.map((e) => {
          const count = parents[e.id] ?? 0
          const selected = e.id === parent
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled || count === 0}
              onClick={() => onParent(e.id)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? 'bg-accent text-bg' : 'bg-elevated text-text hover:bg-elevated/70'
              }`}
            >
              {e.label} <span className="font-normal opacity-80">({count})</span>
            </button>
          )
        })}
      </div>
      {entry && (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Sous-genre</span>
          <select
            value={sub ?? ''}
            disabled={disabled}
            onChange={(ev) => onSub(ev.target.value === '' ? undefined : (ev.target.value as SubId))}
            className="w-full max-w-xs rounded-md bg-elevated px-3 py-2 text-text"
          >
            <option value="">Tous ({parents[entry.id] ?? 0})</option>
            {entry.subs.map((s) => (
              <option key={s.id} value={s.id} disabled={(subs[s.id] ?? 0) === 0}>
                {s.label} ({subs[s.id] ?? 0})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
