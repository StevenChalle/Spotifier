import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

type Props = {
  open: boolean
  currentName: string
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

export default function RenameDialog({ open, currentName, pending, error, onSubmit, onCancel }: Props) {
  const titleId = useId()
  const inputId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const trigger = useRef<Element | null>(null)
  const [name, setName] = useState(currentName)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      trigger.current = document.activeElement
      setName(currentName)
      dialog.showModal()
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (!open && dialog.open) {
      dialog.close()
      if (trigger.current instanceof HTMLElement) trigger.current.focus()
      trigger.current = null
    }
  }, [open, currentName])

  const trimmed = name.trim()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!trimmed || pending) return
    if (trimmed === currentName) onCancel() // unchanged: close without a call
    else onSubmit(trimmed)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onCancel()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (!pending) onCancel()
        }
      }}
      className="m-auto w-full max-w-md rounded-2xl bg-elevated p-6 text-text shadow-2xl backdrop:bg-black/70"
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className="mb-4 text-xl font-bold">
          Renommer la playlist
        </h2>
        <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-muted">
          Nouveau nom
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={name}
          maxLength={100}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-md bg-surface px-3 py-2 text-text"
        />
        {error && (
          <p role="alert" className="mb-4 text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="cursor-pointer rounded-full px-5 py-2.5 font-bold text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!trimmed || pending}
            className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-bg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Renommer
          </button>
        </div>
      </form>
    </dialog>
  )
}
