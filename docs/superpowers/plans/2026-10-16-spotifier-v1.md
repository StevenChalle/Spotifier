# Spotifier v1 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** PWA locale au look Spotify pour voir/renommer/supprimer ses playlists et créer une playlist
depuis ses titres likés filtrés par genre (2 niveaux) et par année.

**Architecture :** SPA statique Vite/React sans backend. Auth Spotify PKCE dans le navigateur. Logique
métier pure (taxonomie, classification, filtres, diff de sync) dans `src/lib/`, testée unitairement ;
clients HTTP minces (Spotify, Last.fm) avec throttle/retry ; cache persistant IndexedDB via Dexie ;
UI React + TanStack Query.

**Tech Stack :** Node LTS (fnm), npm, Vite, React 19, TypeScript strict, Tailwind CSS v4
(`@tailwindcss/vite`), TanStack Query v5, React Router (mode librairie), Dexie 4, vite-plugin-pwa,
Vitest + Testing Library + fake-indexeddb, ESLint. Versions : dernières stables au moment de l'install.

**Spec :** `docs/superpowers/specs/2026-10-16-spotifier-v1-design.md`

## Global Constraints

- Repo : WSL Ubuntu `~/Home/Spotifier`. Toutes les commandes s'exécutent dans WSL.
- Le serveur de dev et `preview` écoutent sur `127.0.0.1:8888` (`strictPort: true`), pas `localhost`.
- Redirect URI : `http://127.0.0.1:8888/callback`. Client ID : `<VITE_SPOTIFY_CLIENT_ID, voir .env>`.
- Scopes : `playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify`.
- Endpoints Spotify post-février 2026 : `POST /me/playlists`, `/playlists/{id}/items`,
  `DELETE /me/library` (unfollow), `GET /artists/{id}` un par un (pas de batch), `GET /me/tracks`.
  Vérifier chaque endpoint contre <https://developer.spotify.com/documentation/web-api> avant de l'écrire.
- `.env` non versionné, `.env.example` versionné : `VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_REDIRECT_URI`,
  `VITE_LASTFM_API_KEY`. Le shared secret Last.fm n'apparaît **nulle part**.
- Last.fm : ≤ 4 requêtes/s (marge sous la limite de 5/s).
- Cascade de genres stricte : tags Last.fm du titre → tags Last.fm de l'artiste → genres Spotify de
  l'artiste → non classé (spec §7).
- Playlists créées privées par défaut. Suppression = confirmation obligatoire.
- **Git : aucune commande git modifiante** (pas de `git init/add/commit`). Steven décide. Les étapes
  « Commit » des tâches sont remplacées par « Point d'arrêt : signaler les fichiers modifiés ».
- Langue de l'UI : français.

## Review Focus

1. **Token Spotify qui expire pendant l'analyse (~25 min) ou entre deux sessions** → refresh transparent
   via refresh token, aucune perte de progression ; si le refresh échoue, retour à l'écran de connexion.
   Test : Task 3 `spotifyFetch refreshes on 401 then retries once`.
2. **Titres likés atypiques** (fichiers locaux `is_local`, `track: null`, artistes avec `&`, `/`, accents,
   titres avec « - Remastered 2011 ») → ignorés ou requêtés proprement, jamais de crash.
   Tests : Task 7 `computeSyncDiff skips local and null tracks`, Task 5 `cleanTrackTitle strips remaster suffixes`.
3. **Date de sortie imprécise** (`"1987"`, `"1987-05"`, `"0000"`) → année extraite ou `null` ; un titre
   sans année n'est exclu que si un filtre d'année est actif. Test : Task 8 `releaseYear`.
4. **Création avec plus de 100 titres ou 0 titre** → ajout par lots de 100 ; bouton « Créer » désactivé
   à 0. Tests : Task 3 `addItemsToPlaylist chunks by 100`, Task 11 `create button disabled when no match`.
5. **Erreurs/limites réseau pendant l'analyse** (429 Spotify avec `Retry-After`, erreur Last.fm 29,
   titre inconnu erreur 6) → attente puis retry pour les limites, `[]` pour « inconnu », l'analyse continue.
   Tests : Task 3 `retries after Retry-After on 429`, Task 5 `error 6 returns empty tags`, `error 29 retries`.

---

## Structure des fichiers

```
Makefile, .node-version, .env.example, .gitignore, index.html, vite.config.ts, tsconfig*.json, eslint.config.js
public/icons/ (icon-192.png, icon-512.png, maskable-512.png)
src/
  main.tsx, App.tsx (routes), index.css (thème Tailwind)
  config.ts                    — lecture/validation des variables VITE_*
  lib/spotify/auth.ts          — PKCE, URL d'autorisation, échange/refresh, stockage des tokens
  lib/spotify/client.ts        — spotifyFetch (auth, 401→refresh, 429→retry), pagination
  lib/spotify/api.ts           — fonctions endpoint typées
  lib/spotify/types.ts
  lib/lastfm/client.ts         — throttle, getTrackTopTags, getArtistTopTags
  lib/genres/taxonomy.ts       — données : parents, sous-genres, alias
  lib/genres/mapping.ts        — normalizeTag, mapTags
  lib/genres/classify.ts       — cascade → GenreProfile
  lib/db.ts                    — schéma Dexie
  lib/sync.ts                  — computeSyncDiff, syncLikedTracks, runAnalysis, forceResync
  lib/filter.ts                — releaseYear, filterTracks, countByGenre
  lib/throttle.ts              — createThrottle
  hooks/ (useAuth, usePlaylists, useLibrarySync)
  components/ (Layout, Sidebar, PlaylistCard, ConfirmDialog, RenameDialog, SyncStatus, GenrePicker, TrackPreview)
  pages/ (LoginPage, CallbackPage, PlaylistsPage, CreateFromLikesPage)
tests/ (miroir de src/lib + pages)
```

---

### Task 1 : Socle projet, outillage et Makefile

**Files :** Create : tout le squelette ci-dessus hors `src/lib`, `src/pages`, `src/components` ;
`Makefile`, `.node-version`, `.env.example`, `.env` (rempli avec les vraies valeurs, non versionné),
`tests/smoke.test.ts`.

**Interfaces :**
- Produces : `config` dans `src/config.ts` : `{ spotifyClientId: string; spotifyRedirectUri: string; lastfmApiKey: string }`,
  qui lève une `Error` explicite si une variable manque.
- Produces : cibles make `help` (défaut), `install`, `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `clean`.

- [ ] **Step 1 : Installer Node.** `fnm install --lts`, écrire la version obtenue dans `.node-version`,
  `fnm use`. Vérifier : `node -v` affiche cette version.
- [ ] **Step 2 : Scaffolder** avec `npm create vite@latest . -- --template react-ts` (dossier contenant déjà `docs/`
  → répondre « ignorer les fichiers existants »). Ajouter Tailwind v4 (`tailwindcss @tailwindcss/vite`),
  Vitest + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` + `fake-indexeddb`.
- [ ] **Step 3 : `vite.config.ts`** : `server` et `preview` = `{ host: '127.0.0.1', port: 8888, strictPort: true }` ;
  `test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'] }`. `tsconfig` en `strict: true`.
- [ ] **Step 4 : Makefile.** Chaque cible préfixe ses commandes par `eval "$$(fnm env)" && fnm use --silent-if-unchanged &&`
  (Node n'est pas sur le PATH non interactif). `install` = `fnm install` (lit `.node-version`) + `npm ci`
  (ou `npm install` sans lockfile). `help` liste les cibles via les commentaires `## `. `clean` supprime
  `dist/ node_modules/.vite coverage/`.
- [ ] **Step 5 : `.gitignore`** inclut `node_modules`, `dist`, `.env`, `coverage`. `.env.example` avec
  les trois clés, valeurs vides sauf la redirect URI.
- [ ] **Step 6 : Test fumée** `tests/smoke.test.ts` : `expect(1 + 1).toBe(2)` et `config` lève quand
  `VITE_LASTFM_API_KEY` est vide (stubber `import.meta.env` via `vi.stubEnv`).
- [ ] **Step 7 : Vérifier** `make test`, `make typecheck`, `make lint`, `make build` : tous OK.
  `make dev` puis ouvrir `http://127.0.0.1:8888` depuis Windows : la page Vite s'affiche. Si Windows
  n'atteint pas le serveur WSL, noter le problème et le signaler (ne pas changer le port ni l'hôte de la
  redirect URI).
- [ ] **Step 8 : Point d'arrêt** — lister les fichiers créés.

### Task 2 : Authentification Spotify PKCE

**Files :** Create `src/lib/spotify/auth.ts`, `tests/lib/spotify/auth.test.ts`.

**Interfaces :**
- Consumes : `config`.
- Produces :
  - `generateCodeVerifier(): string` (64 caractères `[A-Za-z0-9-._~]`)
  - `computeCodeChallenge(verifier: string): Promise<string>` (SHA-256, base64url sans `=`)
  - `beginLogin(): Promise<void>` — stocke verifier + `state` en `sessionStorage`, redirige
  - `buildAuthorizeUrl(params: { challenge: string; state: string }): string`
  - `handleCallback(url: URL): Promise<void>` — vérifie `state`, échange le code, stocke les tokens
  - `getValidAccessToken(): Promise<string | null>` — refresh si expiration < 60 s
  - `refreshAccessToken(): Promise<string>` — lève `AuthError` si échec et purge les tokens
  - `logout(): void`
  - Tokens en `localStorage` clé `spotifier.tokens` : `{ accessToken, refreshToken, expiresAt }`.

- [ ] **Step 1 : Tests en échec :**
  - `computeCodeChallenge matches node crypto` : comparer à `createHash('sha256').update(v).digest('base64url')`.
  - `generateCodeVerifier` : longueur 64, regex `^[A-Za-z0-9\-._~]+$`.
  - `buildAuthorizeUrl` : host `accounts.spotify.com/authorize`, `response_type=code`,
    `code_challenge_method=S256`, `redirect_uri=http://127.0.0.1:8888/callback`, `scope` égal à la liste globale.
  - `handleCallback rejects mismatched state`.
  - `getValidAccessToken refreshes when token expires in < 60s` (fetch mocké, vérifie `grant_type=refresh_token`).
- [ ] **Step 2 :** `make test` → FAIL.
- [ ] **Step 3 : Implémenter** (token endpoint `https://accounts.spotify.com/api/token`,
  `application/x-www-form-urlencoded`, `client_id` dans le corps, pas de secret).
- [ ] **Step 4 :** `make test` → PASS.
- [ ] **Step 5 : Point d'arrêt.**

### Task 3 : Client et endpoints Spotify

**Files :** Create `src/lib/spotify/{client,api,types}.ts`, `tests/lib/spotify/{client,api}.test.ts`.

**Interfaces :**
- Consumes : `getValidAccessToken`, `refreshAccessToken`.
- Produces :
  - `spotifyFetch<T>(path: string, init?: RequestInit): Promise<T>` — base `https://api.spotify.com/v1`,
    401 → un refresh puis un retry, 429 → attendre `Retry-After` s (défaut 1) et retry (max 5), 204 → `undefined`.
  - `fetchAllPages<T>(firstPath: string, onPage?: (loaded: number, total: number) => void): Promise<T[]>` (suit `next`).
  - Types : `SpotifyUser { id; display_name }`, `SpotifyPlaylist { id; name; uri; owner: { id }; images; items: { total } }`
    (vérifier le nom du champ de comptage dans la doc), `SavedTrack { added_at; track: SpotifyTrack | null }`,
    `SpotifyTrack { id; uri; name; is_local; artists: { id; name }[]; album: { name; release_date; release_date_precision; images } }`,
    `SpotifyArtist { id; name; genres: string[] }`.
  - `getMe()`, `getMyPlaylists(): Promise<SpotifyPlaylist[]>`, `renamePlaylist(id, name)`,
    `removePlaylistFromLibrary(uri)`, `getSavedTracks(onProgress?)`, `getArtist(id)`,
    `createPlaylist({ name, description, isPublic }): Promise<SpotifyPlaylist>`,
    `addItemsToPlaylist(id, uris: string[])`.

- [ ] **Step 1 : Tests en échec** (fetch mocké) :
  - `spotifyFetch refreshes on 401 then retries once` ; un second 401 → `AuthError`.
  - `retries after Retry-After on 429` (faux timers, `Retry-After: 2` → attend 2000 ms).
  - `fetchAllPages follows next until null`.
  - `addItemsToPlaylist chunks by 100` : 250 URIs → 3 appels POST `/playlists/{id}/items` de 100/100/50.
  - `createPlaylist posts to /me/playlists with public:false by default`.
  - `removePlaylistFromLibrary calls DELETE /me/library with the playlist uri`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 4 : Taxonomie et mapping des genres

**Files :** Create `src/lib/genres/{taxonomy,mapping}.ts`, `tests/lib/genres/mapping.test.ts`.

**Interfaces :**
- Produces :
  - `type GenreRef = { parent: ParentId; sub?: SubId }` ; `ParentId`/`SubId` = unions de slugs littéraux.
  - `TAXONOMY: { id: ParentId; label: string; subs: { id: SubId; label: string }[] }[]` — les 15 parents de la spec §7
    avec leurs sous-genres (le builder peut en ajouter).
  - `ALIASES: Record<string, GenreRef>` — clés normalisées (≥ 150 entrées couvrant les tags Last.fm et
    genres Spotify courants : ex. `hip hop`, `rap`, `french hip hop`, `rap francais`, `trap`, `uk drill`,
    `deep house`, `tech house`, `techno`, `dnb`, `drum and bass`, `french touch`, `chanson francaise`…).
  - `normalizeTag(tag: string): string` — minuscules, sans accents (NFD), `-`/`_` → espace, espaces compactés, trim.
  - `mapTags(tags: string[]): GenreRef[]` — sans doublons ; un tag sans alias exact est essayé par
    correspondance de sous-chaîne sur les alias de **sous-genres** puis de parents (ex. `melodic deep house`
    contient `deep house`). Un sous-genre implique son parent (le `GenreRef` contient les deux).

- [ ] **Step 1 : Tests en échec :**
  - `normalizeTag('Rap Français') === 'rap francais'`, `normalizeTag('Drum_and-Bass') === 'drum and bass'`.
  - `mapTags(['deep house'])` → `[{ parent: 'electro', sub: 'house' }]`.
  - `mapTags(['hip hop'])` → `[{ parent: 'rap' }]`.
  - `mapTags(['seen live', 'favorites', 'female vocalists'])` → `[]`.
  - `mapTags(['melodic deep house'])` contient `{ parent: 'electro', sub: 'house' }`.
  - `mapTags(['french hip hop', 'trap'])` contient Rap › Rap FR et Rap › Trap, sans doublon.
  - `every alias points to an existing parent/sub` (cohérence des données).
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 5 : Client Last.fm

**Files :** Create `src/lib/throttle.ts`, `src/lib/lastfm/client.ts`, `tests/lib/lastfm/client.test.ts`, `tests/lib/throttle.test.ts`.

**Interfaces :**
- Produces :
  - `createThrottle(perSecond: number): <T>(fn: () => Promise<T>) => Promise<T>`
  - `type WeightedTag = { name: string; count: number }`
  - `getTrackTopTags(artist: string, track: string): Promise<WeightedTag[]>`
  - `getArtistTopTags(artist: string): Promise<WeightedTag[]>`
  - `cleanTrackTitle(title: string): string` — retire ` - Remastered…`, ` - Remaster`, ` - Live…`,
    ` (feat. …)`, ` - Radio Edit`, etc.
  - Appels `https://ws.audioscrobbler.com/2.0/?method=…&format=json&autocorrect=1&api_key=…`, via un throttle à 4/s partagé.

- [ ] **Step 0 : Vérifier CORS** : `curl -sI "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=Daft%20Punk&api_key=$KEY&format=json" -H "Origin: http://127.0.0.1:8888"`
  → présence de `Access-Control-Allow-Origin`. Si absent : s'arrêter et le signaler (changement d'architecture).
- [ ] **Step 1 : Tests en échec :**
  - `createThrottle(4)` : 8 appels → le 8ᵉ démarre ≥ 1 750 ms après le 1ᵉʳ (faux timers).
  - `getTrackTopTags parses toptags.tag` (une réponse avec un seul tag objet et non tableau est aussi gérée).
  - `error 6 returns empty tags`.
  - `error 29 retries` (attend puis réussit).
  - `cleanTrackTitle strips remaster suffixes` : `'Come Together - Remastered 2009'` → `'Come Together'` ;
    `'Song (feat. X)'` → `'Song'`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 6 : Classification en cascade

**Files :** Create `src/lib/genres/classify.ts`, `tests/lib/genres/classify.test.ts`.

**Interfaces :**
- Consumes : `mapTags`, `WeightedTag`, `getTrackTopTags`, `getArtistTopTags`, `getArtist`, `cleanTrackTitle`.
- Produces :
  - `type GenreSource = 'lastfm-track' | 'lastfm-artist' | 'spotify-artist' | 'none'`
  - `type GenreProfile = { trackId: string; genres: GenreRef[]; source: GenreSource; rawTags: string[]; analyzedAt: number }`
  - `type ArtistInfo = { artistId: string; lastfmTags: WeightedTag[]; spotifyGenres: string[] | null; fetchedAt: number }`
    (`spotifyGenres: null` = pas encore demandé).
  - `TAG_MIN_COUNT = 10`, `ARTIST_TOP_N = 5`
  - `classifyTrack(track: SpotifyTrack, deps: ClassifyDeps): Promise<GenreProfile>` où
    `ClassifyDeps = { trackTags(artist, title); artistTags(artist); spotifyArtist(id); getArtistInfo(id); saveArtistInfo(info) }`
    (injection pour les tests et le cache artiste).
  - Artiste principal = `track.artists[0]`.

- [ ] **Step 1 : Tests en échec :**
  - `uses only track tags when they map` : tags titre `deep house` (50) + tags artiste `techno` → genres = House seulement, source `lastfm-track`.
  - `ignores track tags below TAG_MIN_COUNT`.
  - `falls back to artist top 5 tags` quand les tags titre ne mappent rien → source `lastfm-artist`.
  - `falls back to spotify artist genres` quand Last.fm ne donne rien → source `spotify-artist`.
  - `returns none when nothing maps`.
  - `reuses cached artist info` : `artistTags` non appelé si `getArtistInfo` renvoie une entrée.
  - `does not call spotifyArtist when last.fm artist tags map`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 7 : Base locale et synchronisation

**Files :** Create `src/lib/db.ts`, `src/lib/sync.ts`, `tests/lib/sync.test.ts`, `tests/setup.ts` (import `fake-indexeddb/auto`, jest-dom).

**Interfaces :**
- Produces :
  - Dexie `db` (nom `spotifier`), tables : `likedTracks` (clé `id`, `LikedTrack = { id; uri; name; artists; albumName; releaseDate; releaseDatePrecision; addedAt; imageUrl? }`),
    `profiles` (clé `trackId`, `GenreProfile`), `artists` (clé `artistId`, `ArtistInfo`), `meta` (clé `key`).
  - `computeSyncDiff(remote: SavedTrack[], localIds: Set<string>): { upserts: LikedTrack[]; removedIds: string[] }`
    — ignore `track === null` et `is_local`.
  - `syncLikedTracks(onProgress?): Promise<{ added: number; removed: number }>` — remplace la liste, supprime les profils des titres retirés.
  - `pendingTrackIds(): Promise<string[]>` — titres likés sans profil.
  - `runAnalysis(opts: { signal: AbortSignal; onProgress: (done: number, total: number) => void }): Promise<void>`
    — traite `pendingTrackIds()` un par un, `db.profiles.put` après chaque titre (reprenable). Une erreur
    non récupérable sur un titre enregistre un profil `source: 'none'` avec `rawTags: []` et continue.
    `AuthError` interrompt.
  - `forceResync(): Promise<void>` — vide `profiles` et `artists`, puis la sync suivante relance tout.

- [ ] **Step 1 : Tests en échec :**
  - `computeSyncDiff skips local and null tracks`.
  - `computeSyncDiff reports removed ids`.
  - `syncLikedTracks deletes profiles of unliked tracks` (getSavedTracks mocké, fake-indexeddb).
  - `runAnalysis resumes` : 3 titres en attente, abort après le 1ᵉʳ → 1 profil ; relance → 3 profils, `classifyTrack` appelé 3 fois au total.
  - `forceResync clears profiles and artists`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 8 : Filtres genre/année

**Files :** Create `src/lib/filter.ts`, `tests/lib/filter.test.ts`.

**Interfaces :**
- Produces :
  - `releaseYear(date: string | undefined): number | null` — 4 premiers chiffres ; `null` si absent ou `0000`.
  - `type TrackFilter = { parent: ParentId; sub?: SubId; yearMin?: number; yearMax?: number }`
  - `filterTracks(tracks: LikedTrack[], profiles: Map<string, GenreProfile>, f: TrackFilter): LikedTrack[]` — tri par `addedAt` décroissant.
  - `countByGenre(tracks, profiles): { parents: Record<ParentId, number>; subs: Record<SubId, number>; unclassified: number }`
  - `defaultPlaylistName(f: TrackFilter): string` — ex. `Likés · Électro › House · 2015–2020`, `Likés · Rap · depuis 2010`, `Likés · Rock · jusqu'à 1990`.

- [ ] **Step 1 : Tests en échec :**
  - `releaseYear` : `'1987'`→1987, `'1987-05'`→1987, `'2001-09-11'`→2001, `'0000'`→null, `undefined`→null.
  - `filters by parent` ; `filters by sub` ; `sub implies parent membership`.
  - `year bounds are inclusive` ; `track without year excluded only when a year filter is set`.
  - `countByGenre counts multi-genre tracks in each genre`.
  - `defaultPlaylistName` : les trois formats ci-dessus.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** point d'arrêt.

### Task 9 : Shell UI, thème Spotify, connexion

**Files :** Create `src/index.css`, `src/App.tsx`, `src/main.tsx`, `src/hooks/useAuth.ts`, `src/hooks/useLibrarySync.ts`,
`src/components/{Layout,Sidebar,SyncStatus}.tsx`, `src/pages/{LoginPage,CallbackPage}.tsx`, `tests/pages/login.test.tsx`.

**Interfaces :**
- Consumes : `beginLogin`, `handleCallback`, `getValidAccessToken`, `logout`, `syncLikedTracks`, `runAnalysis`, `forceResync`, `countByGenre`.
- Produces :
  - Routes : `/login`, `/callback`, `/` (→ `/playlists`), `/playlists`, `/create`. Routes protégées redirigent vers `/login` sans token.
  - `useLibrarySync(): { phase: 'idle' | 'syncing' | 'analyzing' | 'done' | 'error'; done: number; total: number; classified: number; unclassified: number; resync(): void }`
    — au montage : sync puis analyse en arrière-plan (un seul run à la fois, abort au démontage).
  - Thème Tailwind (`@theme`) : `--color-bg #121212`, `--color-surface #181818`, `--color-elevated #282828`,
    `--color-accent #1DB954`, `--color-text #FFFFFF`, `--color-muted #B3B3B3` ; police Figtree (Google Fonts).
- Sidebar : liens « Mes playlists », « Créer depuis mes likes », `SyncStatus` (barre de progression `done/total`,
  compteur classés/non classés, bouton « Resynchroniser » avec confirmation), nom de l'utilisateur + déconnexion.

- [ ] **Step 1 : Test en échec** `login page shows connect button and calls beginLogin`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Vérif manuelle** : `make dev`, se connecter avec Spotify, arriver sur `/playlists`,
  la sync démarre et la progression avance dans la sidebar ; recharger la page → la progression reprend.
- [ ] **Step 6 : Point d'arrêt.**

### Task 10 : Page Mes playlists

**Files :** Create `src/hooks/usePlaylists.ts`, `src/pages/PlaylistsPage.tsx`, `src/components/{PlaylistCard,ConfirmDialog,RenameDialog}.tsx`,
`tests/pages/playlists.test.tsx`.

**Interfaces :**
- Consumes : `getMe`, `getMyPlaylists`, `renamePlaylist`, `removePlaylistFromLibrary`.
- Produces : `usePlaylists()` (query `['playlists']`), mutations `rename`/`remove` qui invalident `['playlists']`.
- Grille de cartes (image, nom, nb de titres, propriétaire). Renommer visible seulement si `owner.id === me.id`.
  Supprimer → `ConfirmDialog` affichant le nom exact de la playlist ; texte : « Retirer "{nom}" de ta bibliothèque ? ».

- [ ] **Step 1 : Tests en échec :**
  - `rename hidden for playlists not owned by me`.
  - `delete requires confirmation` : clic sur Supprimer n'appelle pas `removePlaylistFromLibrary` ; clic sur Confirmer l'appelle avec l'URI de **cette** playlist.
  - `rename rejects empty name` (bouton désactivé si nom vide après trim).
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Vérif manuelle** : renommer puis supprimer une playlist de test créée pour l'occasion dans Spotify.
- [ ] **Step 6 : Point d'arrêt.**

### Task 11 : Page Créer depuis mes likes

**Files :** Create `src/pages/CreateFromLikesPage.tsx`, `src/components/{GenrePicker,TrackPreview}.tsx`, `tests/pages/create.test.tsx`.

**Interfaces :**
- Consumes : `db` (via `useLiveQuery` de `dexie-react-hooks`), `filterTracks`, `countByGenre`, `defaultPlaylistName`,
  `createPlaylist`, `addItemsToPlaylist`, `useLibrarySync`, `TAXONOMY`.
- `GenrePicker` : sélecteur de parent (avec compteur), puis sous-genres du parent (option « Tous »), compteurs affichés.
- Années min/max : champs numériques optionnels.
- Aperçu : nombre de titres + liste (pochette, titre, artistes, année, source du genre).
- Bandeau si l'analyse est en cours : « Analyse en cours (x/N) — les résultats peuvent être incomplets ».
- Nom pré-rempli par `defaultPlaylistName`, modifiable. Après création : lien `open.spotify.com/playlist/{id}`.

- [ ] **Step 1 : Tests en échec :**
  - `create button disabled when no match`.
  - `sub-genre list follows selected parent`.
  - `creates private playlist then adds filtered uris` (api mockée, vérifie l'ordre create → add et les URIs).
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Vérif manuelle** : créer une playlist « Électro » filtrée 2015–2020 et la vérifier dans Spotify.
- [ ] **Step 6 : Point d'arrêt.**

### Task 12 : PWA

**Files :** Modify `vite.config.ts` ; Create `public/icons/*`.

**Interfaces :**
- `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Spotifier', short_name: 'Spotifier', theme_color: '#121212', background_color: '#121212', display: 'standalone', start_url: '/', icons: [192, 512, 512 maskable] } })`.
- Le service worker ne met **pas** en cache les appels `api.spotify.com`, `accounts.spotify.com`, `ws.audioscrobbler.com`
  (pas de `runtimeCaching` pour ces domaines). Le fallback de navigation SPA doit servir `/callback?code=…`
  correctement avec le SW actif (vérifié en Step 2).
- Icônes : générées (SVG simple → PNG) au design de l'app.

- [ ] **Step 1 :** `make build` → `dist/manifest.webmanifest` et `dist/sw.js` présents.
- [ ] **Step 2 :** `make preview`, ouvrir `http://127.0.0.1:8888` dans Chrome/Edge → icône « Installer » visible ;
  installer, se reconnecter (callback OK avec SW actif).
- [ ] **Step 3 :** `make test lint typecheck` tous verts.
- [ ] **Step 4 : Point d'arrêt final** — liste des fichiers, et demander à Steven s'il veut `git init` + premier commit.
