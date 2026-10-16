import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyPlaylists, removePlaylistFromLibrary, renamePlaylist } from '../lib/spotify/api'

export function usePlaylists() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playlists'] })

  const query = useQuery({ queryKey: ['playlists'], queryFn: getMyPlaylists })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renamePlaylist(id, name),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (uri: string) => removePlaylistFromLibrary(uri),
    onSuccess: invalidate,
  })

  return { query, rename, remove }
}
