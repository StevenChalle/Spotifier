import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const handleCallback = vi.fn<(url: URL) => Promise<void>>()
const beginLogin = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/spotify/auth', () => ({
  AuthError: class AuthError extends Error {},
  handleCallback: (url: URL) => handleCallback(url),
  beginLogin: () => beginLogin(),
}))

import CallbackPage from '../../src/pages/CallbackPage'

function renderCallback() {
  return render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<CallbackPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

afterEach(() => {
  cleanup()
  handleCallback.mockReset()
})

describe('CallbackPage', () => {
  it('calls handleCallback once under StrictMode double mount', async () => {
    window.history.replaceState({}, '', '/callback?code=a&state=b')
    handleCallback.mockResolvedValue(undefined)
    renderCallback()
    await vi.waitFor(() => expect(handleCallback).toHaveBeenCalled())
    expect(handleCallback).toHaveBeenCalledTimes(1)
  })

  it('shows the error and a retry button when the callback fails', async () => {
    window.history.replaceState({}, '', '/callback?code=c&state=d')
    handleCallback.mockRejectedValue(new Error('réseau'))
    renderCallback()
    expect(await screen.findByRole('button', { name: 'Réessayer la connexion' })).toBeInTheDocument()
    expect(handleCallback).toHaveBeenCalledTimes(1)
  })
})
