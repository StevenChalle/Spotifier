import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getMe } from '../lib/spotify/api'
import { AuthError, getValidAccessToken, logout as clearTokens } from '../lib/spotify/auth'

export type AuthUser = { id: string; name: string }

async function loadUser(): Promise<AuthUser | null> {
  try {
    if (!(await getValidAccessToken())) return null
    const me = await getMe()
    return { id: me.id, name: me.display_name ?? me.id }
  } catch (e) {
    // Session definitively rejected: back to the login screen.
    if (e instanceof AuthError) return null
    throw e
  }
}

export function useAuth() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['me'], queryFn: loadUser, staleTime: Infinity, retry: 1 })

  const logout = useCallback(() => {
    clearTokens()
    queryClient.setQueryData(['me'], null)
  }, [queryClient])

  const status = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data
        ? 'authenticated'
        : 'anonymous'

  return { status, user: query.data ?? null, logout, retry: query.refetch } as const
}
