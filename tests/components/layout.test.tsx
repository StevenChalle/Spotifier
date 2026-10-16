import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  value: { status: 'anonymous', user: null, logout: vi.fn(), retry: vi.fn() } as Record<string, unknown>,
}))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth.value }))
vi.mock('../../src/hooks/useLibrarySync', () => ({ useLibrarySync: vi.fn() }))

import Layout from '../../src/components/Layout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/playlists']}>
      <Routes>
        <Route path="/login" element={<p>page login</p>} />
        <Route element={<Layout />}>
          <Route path="/playlists" element={<p>page playlists</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Layout', () => {
  it('redirects to /login without a session', () => {
    auth.value = { status: 'anonymous', user: null, logout: vi.fn(), retry: vi.fn() }
    renderLayout()
    expect(screen.getByText('page login')).toBeInTheDocument()
  })

  it('offers logout on the getMe error screen and goes to /login', async () => {
    const logout = vi.fn()
    auth.value = { status: 'error', user: null, logout, retry: vi.fn() }
    renderLayout()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(screen.getByText('page login')).toBeInTheDocument()
  })
})
