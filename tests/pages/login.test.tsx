import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const beginLogin = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/spotify/auth', () => ({ beginLogin: () => beginLogin() }))

import LoginPage from '../../src/pages/LoginPage'

afterEach(() => {
  cleanup()
  beginLogin.mockClear()
})

describe('LoginPage', () => {
  it('login page shows connect button and calls beginLogin', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter avec Spotify' }))
    expect(beginLogin).toHaveBeenCalledTimes(1)
  })
})
