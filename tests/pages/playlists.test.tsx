import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getMyPlaylists: vi.fn(),
  renamePlaylist: vi.fn(),
  removePlaylistFromLibrary: vi.fn(),
}))
vi.mock('../../src/lib/spotify/api', () => api)
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'authenticated', user: { id: 'me', name: 'Moi' } }),
}))

import PlaylistsPage from '../../src/pages/PlaylistsPage'

const mine = { id: 'p1', name: 'Ma playlist', uri: 'spotify:playlist:p1', owner: { id: 'me' }, images: [], items: { total: 3 } }
const theirs = { id: 'p2', name: 'Playlist amie', uri: 'spotify:playlist:p2', owner: { id: 'other' }, images: null, items: undefined }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PlaylistsPage />
    </QueryClientProvider>,
  )
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement

beforeEach(() => {
  api.getMyPlaylists.mockResolvedValue([mine, theirs])
  api.renamePlaylist.mockResolvedValue(undefined)
  api.removePlaylistFromLibrary.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PlaylistsPage', () => {
  it('rename hidden for playlists not owned by me', async () => {
    renderPage()
    await screen.findByText('Ma playlist')
    expect(within(card('Ma playlist')).getByRole('button', { name: 'Renommer' })).toBeInTheDocument()
    expect(within(card('Playlist amie')).queryByRole('button', { name: 'Renommer' })).toBeNull()
    expect(within(card('Playlist amie')).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
    expect(within(card('Playlist amie')).queryByText(/titre/)).toBeNull()
  })

  it('shows the track count only when the playlist exposes its items', async () => {
    renderPage()
    expect(await screen.findByText('3 titres')).toBeInTheDocument()
    expect(within(card('Playlist amie')).queryByText(/titre/)).toBeNull()
  })

  it('delete requires confirmation', async () => {
    renderPage()
    await screen.findByText('Playlist amie')
    await userEvent.click(within(card('Playlist amie')).getByRole('button', { name: 'Supprimer' }))
    expect(api.removePlaylistFromLibrary).not.toHaveBeenCalled()
    expect(screen.getByText('Retirer "Playlist amie" de ta bibliothèque ?')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(api.removePlaylistFromLibrary).toHaveBeenCalledTimes(1)
    expect(api.removePlaylistFromLibrary).toHaveBeenCalledWith('spotify:playlist:p2')
  })

  it('rename rejects empty name', async () => {
    renderPage()
    await screen.findByText('Ma playlist')
    await userEvent.click(within(card('Ma playlist')).getByRole('button', { name: 'Renommer' }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('Nouveau nom')
    expect(input).toHaveFocus()
    await userEvent.clear(input)
    await userEvent.type(input, '   ')
    expect(within(dialog).getByRole('button', { name: 'Renommer' })).toBeDisabled()
    expect(api.renamePlaylist).not.toHaveBeenCalled()
  })

  it('renames with the trimmed name on Enter, and skips the call when unchanged', async () => {
    renderPage()
    await screen.findByText('Ma playlist')
    const open = () => userEvent.click(within(card('Ma playlist')).getByRole('button', { name: 'Renommer' }))
    await open()
    await userEvent.keyboard('{Enter}')
    expect(api.renamePlaylist).not.toHaveBeenCalled()

    await open()
    await userEvent.keyboard('{Control>}a{/Control}  Nouveau  {Enter}')
    expect(api.renamePlaylist).toHaveBeenCalledWith('p1', 'Nouveau')
  })

  it('keeps the rename dialog open and shows an error on failure', async () => {
    api.renamePlaylist.mockRejectedValue(new Error('boom'))
    renderPage()
    await screen.findByText('Ma playlist')
    await userEvent.click(within(card('Ma playlist')).getByRole('button', { name: 'Renommer' }))
    await userEvent.keyboard('X{Enter}')
    expect(await screen.findByText('Le renommage a échoué. Réessaie.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a retry button on load error, and the empty state', async () => {
    api.getMyPlaylists.mockRejectedValueOnce(new Error('x'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Ma playlist')).toBeInTheDocument()
    cleanup()
    api.getMyPlaylists.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Aucune playlist dans ta bibliothèque.')).toBeInTheDocument()
  })

  async function confirmDeleteOf(name: string) {
    await userEvent.click(within(card(name)).getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }))
  }

  it('delete: while pending, every card action is disabled (no overlapping deletions)', async () => {
    let resolve!: () => void
    api.removePlaylistFromLibrary.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    renderPage()
    await screen.findByText('Playlist amie')
    await confirmDeleteOf('Playlist amie')
    for (const name of ['Playlist amie', 'Ma playlist']) {
      for (const b of within(card(name)).getAllByRole('button')) expect(b).toBeDisabled()
    }
    resolve()
    await vi.waitFor(() => expect(within(card('Ma playlist')).getByRole('button', { name: 'Supprimer' })).toBeEnabled())
  })

  it('delete failure: error shown on the right card only, buttons re-enabled', async () => {
    api.removePlaylistFromLibrary.mockRejectedValue(new Error('boom'))
    renderPage()
    await screen.findByText('Playlist amie')
    await confirmDeleteOf('Playlist amie')
    expect(await within(card('Playlist amie')).findByRole('alert')).toHaveTextContent('La suppression a échoué')
    expect(within(card('Ma playlist')).queryByRole('alert')).toBeNull()
    expect(within(card('Playlist amie')).getByRole('button', { name: 'Supprimer' })).toBeEnabled()
  })

  it('does not leave an empty name in the confirm message after closing', async () => {
    renderPage()
    await screen.findByText('Playlist amie')
    await userEvent.click(within(card('Playlist amie')).getByRole('button', { name: 'Supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(document.body.textContent).not.toContain('Retirer "" ')
    expect(document.body.textContent).toContain('Retirer "Playlist amie"')
  })

  it('Escape does not close the rename dialog while the rename is pending', async () => {
    api.renamePlaylist.mockReturnValue(new Promise(() => {}))
    renderPage()
    await screen.findByText('Ma playlist')
    await userEvent.click(within(card('Ma playlist')).getByRole('button', { name: 'Renommer' }))
    await userEvent.keyboard('X{Enter}')
    await vi.waitFor(() => expect(api.renamePlaylist).toHaveBeenCalled())
    // The input is disabled while pending, so target the dialog itself (native cancel + keydown).
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('open')
  })
})
