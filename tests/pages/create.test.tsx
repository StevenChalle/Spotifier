import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createPlaylist: vi.fn(),
  addItemsToPlaylist: vi.fn(),
}))
vi.mock('../../src/lib/spotify/api', () => api)

import { LibrarySyncContext } from '../../src/hooks/librarySyncContext'
import type { LibrarySync } from '../../src/hooks/useLibrarySync'
import { db, type LikedTrack } from '../../src/lib/db'
import type { GenreProfile } from '../../src/lib/genres/classify'
import type { GenreRef } from '../../src/lib/genres/taxonomy'
import CreateFromLikesPage from '../../src/pages/CreateFromLikesPage'

const idleSync: LibrarySync = {
  phase: 'done', done: 10, total: 10, classified: 0, unclassified: 0, failed: 0, error: null, resync: () => {}, retry: () => {},
}

function track(id: string, year: string, addedAt = 1): LikedTrack {
  return {
    id, uri: `spotify:track:${id}`, name: `Titre ${id}`, artists: [{ id: 'a', name: 'Artiste' }],
    albumName: 'Album', releaseDate: year, releaseDatePrecision: 'year', addedAt,
  }
}
type Seed = [LikedTrack, GenreRef[], GenreProfile['source']?]
async function seed(items: Seed[]) {
  await db.likedTracks.bulkPut(items.map(([t]) => t))
  await db.profiles.bulkPut(
    items.map(([t, genres, source = 'lastfm-track']) => ({ trackId: t.id, genres, source, rawTags: [], analyzedAt: 1 })),
  )
}

function renderPage(sync: Partial<LibrarySync> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <LibrarySyncContext.Provider value={{ ...idleSync, ...sync }}>
        <CreateFromLikesPage />
      </LibrarySyncContext.Provider>
    </QueryClientProvider>,
  )
  return { invalidate }
}

const createButton = () => screen.getByRole('button', { name: 'Créer la playlist' })
// Parent chips stay disabled (count 0) until the live query has loaded the seeded data.
const pickParent = async (label: RegExp) => {
  const chip = screen.getByRole('button', { name: label })
  await vi.waitFor(() => expect(chip).toBeEnabled())
  await userEvent.click(chip)
}

beforeEach(async () => {
  await db.likedTracks.clear()
  await db.profiles.clear()
  api.createPlaylist.mockResolvedValue({ id: 'new1' })
  api.addItemsToPlaylist.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('CreateFromLikesPage', () => {
  it('create button disabled when no match', async () => {
    await seed([[track('1', '2018'), [{ parent: 'electro', sub: 'house' }]]])
    renderPage()
    expect(createButton()).toBeDisabled() // no parent chosen
    await pickParent(/Électro/)
    expect(await screen.findByText('1 titre')).toBeInTheDocument()
    expect(createButton()).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Année min'), '2025')
    expect(await screen.findByText('0 titre')).toBeInTheDocument()
    expect(createButton()).toBeDisabled()
  })

  it('sub-genre list follows selected parent', async () => {
    await seed([
      [track('1', '2018'), [{ parent: 'electro', sub: 'house' }]],
      [track('2', '2018'), [{ parent: 'rock' }]],
    ])
    renderPage()
    expect(screen.queryByLabelText('Sous-genre')).toBeNull()
    await pickParent(/Électro/)
    const sub = screen.getByLabelText('Sous-genre')
    expect(within(sub).getByRole('option', { name: /Tous/ })).toBeInTheDocument()
    expect(within(sub).getByRole('option', { name: /House \(1\)/ })).toBeInTheDocument()
    expect(within(sub).queryByRole('option', { name: /Punk/ })).toBeNull()
    await pickParent(/Rock/)
    const sub2 = screen.getByLabelText('Sous-genre')
    expect(within(sub2).queryByRole('option', { name: /House/ })).toBeNull()
    expect(within(sub2).getByRole('option', { name: /Punk/ })).toBeInTheDocument()
  })

  it('creates private playlist then adds filtered uris', async () => {
    await seed([
      [track('1', '2016', 3), [{ parent: 'electro' }]],
      [track('2', '2010', 2), [{ parent: 'electro' }]],
      [track('3', '2019', 1), [{ parent: 'electro', sub: 'house' }]],
      [track('4', '2017', 4), [{ parent: 'rock' }]],
    ])
    const { invalidate } = renderPage()
    await pickParent(/Électro/)
    await userEvent.type(screen.getByLabelText('Année min'), '2015')
    await userEvent.type(screen.getByLabelText('Année max'), '2020')
    expect(await screen.findByText('2 titres')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom de la playlist')).toHaveValue('Likés · Électro · 2015–2020')

    const callOrder: string[] = []
    api.createPlaylist.mockImplementation(async () => {
      callOrder.push('create')
      return { id: 'new1' }
    })
    api.addItemsToPlaylist.mockImplementation(async () => {
      callOrder.push('add')
    })
    await userEvent.click(createButton())
    const link = await screen.findByRole('link', { name: /Ouvrir dans Spotify/ })
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/playlist/new1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(callOrder).toEqual(['create', 'add'])
    expect(api.createPlaylist).toHaveBeenCalledWith({
      name: 'Likés · Électro · 2015–2020',
      description: 'Créée par Spotifier depuis mes titres likés',
      isPublic: false,
    })
    expect(api.addItemsToPlaylist).toHaveBeenCalledWith('new1', ['spotify:track:1', 'spotify:track:3'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playlists'] })
  })

  it('previews 200 rows but creates with every filtered track', async () => {
    await seed(Array.from({ length: 250 }, (_, i): Seed => [track(`t${i}`, '2000', i), [{ parent: 'rock' }]]))
    renderPage()
    await pickParent(/Rock/)
    expect(await screen.findByText('250 titres')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(200)
    expect(screen.getByText('… et 50 autres')).toBeInTheDocument()
    await userEvent.click(createButton())
    await screen.findByRole('link', { name: /Ouvrir dans Spotify/ })
    expect(api.addItemsToPlaylist.mock.calls[0][1]).toHaveLength(250)
  })

  it('shows the source badge of each row', async () => {
    await seed([
      [track('1', '2000', 3), [{ parent: 'rock' }], 'lastfm-track'],
      [track('2', '2001', 2), [{ parent: 'rock' }], 'lastfm-artist'],
      [track('3', '2002', 1), [{ parent: 'rock' }], 'spotify-artist'],
    ])
    renderPage()
    await pickParent(/Rock/)
    await screen.findByText('3 titres')
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('titre')).toBeInTheDocument()
    expect(within(rows[1]).getByText('artiste')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Spotify')).toBeInTheDocument()
  })

  it('invalid year range shows a message and disables create', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    renderPage()
    await pickParent(/Rock/)
    await userEvent.type(screen.getByLabelText('Année min'), '2020')
    await userEvent.type(screen.getByLabelText('Année max'), '2010')
    expect(screen.getByRole('alert')).toHaveTextContent(/min.*max/i)
    expect(createButton()).toBeDisabled()
  })

  it('name follows filters until edited by hand; blank name disables create', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]], [track('2', '2018'), [{ parent: 'electro' }]]])
    renderPage()
    await pickParent(/Rock/)
    const name = screen.getByLabelText('Nom de la playlist')
    expect(name).toHaveValue('Likés · Rock')
    await pickParent(/Électro/)
    expect(name).toHaveValue('Likés · Électro')
    await userEvent.clear(name)
    await userEvent.type(name, 'Ma sélection')
    await pickParent(/Rock/)
    expect(name).toHaveValue('Ma sélection')
    await userEvent.clear(name)
    await userEvent.type(name, '   ')
    expect(createButton()).toBeDisabled()
  })

  it('create is disabled during the call and the name is trimmed', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    api.createPlaylist.mockReturnValue(new Promise(() => {}))
    renderPage()
    await pickParent(/Rock/)
    const name = screen.getByLabelText('Nom de la playlist')
    await userEvent.clear(name)
    await userEvent.type(name, '  Mon rock  ')
    await userEvent.click(createButton())
    expect(createButton()).toBeDisabled()
    expect(api.createPlaylist).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mon rock' }))
  })

  it('disables the filter and name controls while a creation is in flight', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    api.createPlaylist.mockReturnValue(new Promise(() => {}))
    renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    expect(screen.getByRole('button', { name: /Rock/ })).toBeDisabled()
    expect(screen.getByLabelText('Sous-genre')).toBeDisabled()
    expect(screen.getByLabelText('Année min')).toBeDisabled()
    expect(screen.getByLabelText('Année max')).toBeDisabled()
    expect(screen.getByLabelText('Nom de la playlist')).toBeDisabled()
    expect(api.createPlaylist).toHaveBeenCalledTimes(1)
  })

  it('reports an incomplete playlist, with its link, when adding items fails', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    api.addItemsToPlaylist.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { invalidate } = renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/créée mais est incomplète/)
    expect(within(alert).getByRole('link')).toHaveAttribute('href', 'https://open.spotify.com/playlist/new1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playlists'] })
  })

  it('shows a plain error when the playlist itself cannot be created', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    api.createPlaylist.mockRejectedValue(new Error('boom'))
    renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('La création a échoué')
    expect(within(alert).queryByRole('link')).toBeNull()
    expect(api.addItemsToPlaylist).not.toHaveBeenCalled()
  })

  it('banner: analysis in progress, or failed tracks to retry', async () => {
    renderPage({ phase: 'analyzing', done: 40, total: 100 })
    expect(await screen.findByText('Analyse en cours (40/100) — les résultats peuvent être incomplets')).toBeInTheDocument()
    cleanup()
    renderPage({ phase: 'idle', failed: 3, done: 97, total: 100 })
    expect(await screen.findByText("3 titres n'ont pas pu être analysés, ils seront retentés au prochain lancement")).toBeInTheDocument()
    expect(screen.queryByText(/Analyse en cours/)).toBeNull()
    cleanup()
    renderPage()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('success message cleared when filters change', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]], [track('2', '2018'), [{ parent: 'electro' }]]])
    renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    await screen.findByRole('link', { name: /Ouvrir dans Spotify/ })
    await pickParent(/Électro/)
    expect(screen.queryByRole('link', { name: /Ouvrir dans Spotify/ })).toBeNull()
    expect(createButton()).toBeEnabled()
  })

  it('create disabled after success until filters change', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    await screen.findByRole('link', { name: /Ouvrir dans Spotify/ })
    expect(createButton()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Année min'), '2000')
    expect(createButton()).toBeEnabled()
  })

  it('a double click creates only one playlist', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    renderPage()
    await pickParent(/Rock/)
    const button = createButton()
    fireEvent.click(button)
    fireEvent.click(button)
    await screen.findByRole('link', { name: /Ouvrir dans Spotify/ })
    expect(api.createPlaylist).toHaveBeenCalledTimes(1)
  })

  it('keeps the cause of a failed add in the console', async () => {
    await seed([[track('1', '2018'), [{ parent: 'rock' }]]])
    const cause = new Error('boom')
    api.addItemsToPlaylist.mockRejectedValue(cause)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    await pickParent(/Rock/)
    await userEvent.click(createButton())
    await screen.findByRole('alert')
    expect(spy).toHaveBeenCalledWith(cause)
    spy.mockRestore()
  })

  it('a track without year is excluded only when a year filter is active; min = max works', async () => {
    await seed([
      [track('1', '2018', 3), [{ parent: 'rock' }]],
      [track('2', '0000', 2), [{ parent: 'rock' }]],
      [track('3', '2019', 1), [{ parent: 'rock' }]],
    ])
    renderPage()
    await pickParent(/Rock/)
    expect(await screen.findByText('3 titres')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Année min'), '2018')
    await userEvent.type(screen.getByLabelText('Année max'), '2018')
    expect(await screen.findByText('1 titre')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Nom de la playlist')).toHaveValue('Likés · Rock · 2018')
    await userEvent.clear(screen.getByLabelText('Année min'))
    await userEvent.clear(screen.getByLabelText('Année max'))
    expect(await screen.findByText('3 titres')).toBeInTheDocument()
  })
})
