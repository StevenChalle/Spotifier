import { useEffect, useId, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const trigger = useRef<Element | null>(null)

  // Native modal dialog: focus trap and inert background come from showModal().
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      trigger.current = document.activeElement
      dialog.showModal()
      cancelRef.current?.focus() // safe action first
    } else if (!open && dialog.open) {
      dialog.close()
      if (trigger.current instanceof HTMLElement) trigger.current.focus()
      trigger.current = null
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="m-auto w-full max-w-md rounded-2xl bg-elevated p-6 text-text shadow-2xl backdrop:bg-black/70"
    >
      <h2 id={titleId} className="mb-2 text-xl font-bold">
        {title}
      </h2>
      <p className="mb-6 text-muted">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full px-5 py-2.5 font-bold text-muted transition hover:text-text"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-bg transition hover:bg-accent-hover"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
