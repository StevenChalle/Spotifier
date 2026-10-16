import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../../src/components/ConfirmDialog'
import RenameDialog from '../../src/components/RenameDialog'

afterEach(cleanup)

function Harness({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <ConfirmDialog
        open={open}
        title="Titre"
        message="Message"
        confirmLabel="Valider"
        onConfirm={onConfirm}
        onCancel={() => {
          onCancel()
          setOpen(false)
        }}
      />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('focuses Annuler first, closes on Escape and gives the focus back to the trigger', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />)
    const trigger = screen.getByRole('button', { name: 'Ouvrir' })
    await userEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('calls onConfirm only from the confirm button', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('dialog ids', () => {
  it('two ConfirmDialogs get distinct title ids, each referenced by aria-labelledby', () => {
    const noop = () => {}
    const { container } = render(
      <>
        <ConfirmDialog open={false} title="Un" message="m" confirmLabel="ok" onConfirm={noop} onCancel={noop} />
        <ConfirmDialog open={false} title="Deux" message="m" confirmLabel="ok" onConfirm={noop} onCancel={noop} />
      </>,
    )
    const dialogs = [...container.querySelectorAll('dialog')]
    const ids = dialogs.map((d) => d.getAttribute('aria-labelledby'))
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
    expect(dialogs.map((d, i) => d.querySelector(`[id="${ids[i]}"]`)?.textContent)).toEqual(['Un', 'Deux'])
  })

  it('two RenameDialogs get distinct title and input ids', () => {
    const noop = () => {}
    const props = { open: false, currentName: 'x', pending: false, error: null, onSubmit: noop, onCancel: noop }
    const { container } = render(
      <>
        <RenameDialog {...props} />
        <RenameDialog {...props} />
      </>,
    )
    const dialogs = [...container.querySelectorAll('dialog')]
    const titleIds = dialogs.map((d) => d.getAttribute('aria-labelledby'))
    expect(titleIds[0]).not.toBe(titleIds[1])
    dialogs.forEach((d, i) => expect(d.querySelector(`[id="${titleIds[i]}"]`)?.tagName).toBe('H2'))
    const inputIds = dialogs.map((d) => d.querySelector('input')?.id)
    expect(inputIds[0]).not.toBe(inputIds[1])
    dialogs.forEach((d) => expect(d.querySelector('label')?.htmlFor).toBe(d.querySelector('input')?.id))
  })
})
