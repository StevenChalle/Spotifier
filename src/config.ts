function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`)
  }
  return value
}

export const config = {
  spotifyClientId: required('VITE_SPOTIFY_CLIENT_ID'),
  spotifyRedirectUri: required('VITE_SPOTIFY_REDIRECT_URI'),
  lastfmApiKey: required('VITE_LASTFM_API_KEY'),
}
