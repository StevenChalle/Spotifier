# Spotifier — Design v1

Date : 2026-10-16
Statut : en attente de validation par Steven

## 1. Intention

Spotifier est une PWA personnelle au look Spotify qui se connecte au compte Spotify de Steven
pour gérer ses playlists et en **créer intelligemment à partir de ses titres likés**.

Le besoin de départ : « je veux une playlist qui rassemble tous mes titres likés d'un genre donné
(et d'une période donnée) », ce que Spotify ne propose pas.

Usage : un seul utilisateur (Steven), en local sur son PC pour l'instant. Un hébergement en ligne
(pour l'installer aussi sur téléphone) est possible plus tard : l'architecture ne doit pas l'empêcher.

## 2. Objectifs (v1)

1. **Connexion** au compte Spotify (OAuth Authorization Code + PKCE, sans secret côté client).
2. **Mes playlists** : lister les playlists de l'utilisateur (image, nom, nombre de titres, propriétaire).
   - **Renommer** une playlist (uniquement celles dont l'utilisateur est propriétaire).
   - **Supprimer** une playlist (= ne plus la suivre ; c'est la seule « suppression » que Spotify permet).
     Confirmation obligatoire avant l'action.
3. **Créer une playlist à partir des titres likés**, filtrée par :
   - **Genre** sur deux niveaux : un genre parent obligatoire (ex. Électro), un sous-genre optionnel
     (ex. House) pour affiner.
   - **Période** : année de sortie min / max (optionnelles).
   - Aperçu de la liste des titres correspondants (nombre + liste) avant création, puis nom de playlist
     (pré-rempli, ex. « Likés · Électro › House · 2015–2020 ») et création.
4. **Cache local des genres** avec synchronisation automatique + bouton de resynchronisation forcée.
5. **PWA** installable (manifest, icônes, service worker).
6. **Makefile** propre pour piloter le projet.

## 3. Non-objectifs (v1)

- Pas de multi-utilisateurs, pas de backend, pas de base de données serveur.
- Pas d'autres sources de genre que Last.fm et Spotify (pas de MusicBrainz, Discogs, Deezer).
- Pas de correction de l'année via la date d'enregistrement originale (on prend la date de sortie de l'album).
- Pas de lecture audio dans l'app.
- Pas de mise à jour automatique d'une playlist déjà générée quand de nouveaux likes arrivent.

## 4. Anti-objectifs (ce qui rendrait l'app ratée même si elle « marche »)

- Une suppression de playlist sans confirmation, ou qui touche une playlist non voulue.
- Un cache de genres qui devient obsolète sans moyen de le rafraîchir.
- Une première analyse qui bloque l'interface sans indiquer la progression.
- Des secrets (shared secret Last.fm, client secret Spotify) présents dans le code ou le repo.

## 5. Contraintes connues (API Spotify, état octobre 2026)

Suite aux changements « Development Mode » de février 2026
(<https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide>) :

- Le propriétaire de l'app Spotify doit être Premium ; 5 utilisateurs max.
- **Batch supprimé** : `GET /artists?ids=` n'existe plus → les artistes se récupèrent **un par un**
  via `GET /artists/{id}`.
- Création : `POST /me/playlists` (l'ancien `POST /users/{id}/playlists` est supprimé).
- Contenu de playlist : `/playlists/{id}/items` (au lieu de `/tracks`), champs renommés `items.items.item`.
- Suppression (unfollow) : `DELETE /me/library` avec l'URI de la playlist (remplace
  `DELETE /playlists/{id}/followers`).
- Titres likés : `GET /me/tracks` (pagination 50).
- Renommer : `PUT /playlists/{id}` avec `{ name }`.
- `GET /me` ne renvoie plus `country`/`email`/`product`.
- Le genre n'existe que sur l'**artiste** côté Spotify, et beaucoup d'artistes n'en ont aucun.

Le builder doit vérifier ces endpoints contre la doc officielle au moment de l'implémentation.

Spotify :
- Client ID : `<VITE_SPOTIFY_CLIENT_ID, voir .env>`
- Redirect URI enregistré : `http://127.0.0.1:8888/callback` (l'app doit donc tourner sur
  `127.0.0.1:8888`, pas `localhost`).
- Scopes : `playlist-read-private playlist-read-collaborative playlist-modify-private
  playlist-modify-public user-library-read user-library-modify`.

Last.fm :
- API key fournie par Steven (dans `.env`). Le shared secret n'est **pas** utilisé et ne doit pas
  être stocké.
- Limite ~5 requêtes/s → throttle côté client.
- Appels directs depuis le navigateur (`ws.audioscrobbler.com/2.0/?format=json`).

## 6. Choix techniques (validés par Steven)

- **Vite + React 19 + TypeScript** (strict).
- **Tailwind CSS v4** pour le design Spotify-like (fond très sombre, vert Spotify `#1DB954`,
  sidebar, cartes de playlist, typo sans-serif proche de Circular, ex. Figtree / Inter).
- **TanStack Query** pour les appels réseau et le cache mémoire.
- **Dexie (IndexedDB)** pour le cache persistant des genres.
- **vite-plugin-pwa** pour le manifest et le service worker.
- **Pas de serveur** : SPA statique, hébergeable plus tard sur un hébergeur statique (il faudra
  alors ajouter la nouvelle redirect URI dans le dashboard Spotify).
- Environnement : WSL Ubuntu, repo `~/Home/Spotifier`. Node installé via **fnm** (déjà présent,
  aucune version de Node installée) — version LTS courante, fixée dans `.node-version`.
  Gestionnaire de paquets : **npm** (choix du builder, aucune préférence exprimée).
- Config via `.env` (non versionné) + `.env.example` versionné :
  `VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_REDIRECT_URI`, `VITE_LASTFM_API_KEY`.

## 7. Classification des genres

### Taxonomie

Une liste fixe, définie dans le code (un fichier de données facile à éditer), de genres parents,
chacun avec ses sous-genres. Base proposée (le builder peut l'étoffer) :

| Parent | Exemples de sous-genres |
|---|---|
| Rap / Hip-hop | Rap FR, Trap, Drill, Boom bap, Cloud rap, Rap US |
| Rock | Indie rock, Punk, Hard rock, Classic rock, Alternative, Grunge |
| Pop | Indie pop, Synthpop, K-pop, Dance pop, Pop FR |
| Électro | House, Techno, Drum & bass, Dubstep, Ambient, Trance, French touch |
| R&B / Soul | R&B contemporain, Neo soul, Soul classique |
| Jazz | Jazz fusion, Bebop, Smooth jazz, Jazz vocal |
| Classique | Baroque, Romantique, Contemporain, Musique de film |
| Reggae | Roots, Dancehall, Dub, Ska |
| Metal | Heavy, Thrash, Death, Black, Metalcore |
| Funk / Disco | Funk, Disco, Nu-disco, Boogie |
| Folk / Country | Folk, Country, Americana |
| Latin | Reggaeton, Salsa, Bossa nova, Latin pop |
| Afro | Afrobeats, Afrobeat, Amapiano, Coupé-décalé |
| Blues | — |
| Variété / Chanson | Chanson française, Variété française |

### Mapping

- Une table d'alias associe des tags normalisés (minuscules, sans accents, `-`/`_` → espace)
  à un couple `(parent, sous-genre?)`. Ex. `deep house` → Électro › House ; `french hip hop`,
  `rap francais` → Rap › Rap FR ; `hip hop` → Rap (sans sous-genre).
- Un tag qui ne correspond à rien est ignoré (ex. `seen live`, `favorites`, `female vocalists`).
- **Un titre peut appartenir à plusieurs genres** (parents et sous-genres).
- Appartenir à un sous-genre implique appartenir à son parent.

### Sources, par titre — cascade stricte

Décision de Steven : le genre du **titre** prime sur celui de l'artiste. Ordre entre Last.fm et
Spotify tranché par le builder (voir justification).

1. **Last.fm `track.getTopTags`** (artiste + titre). Garder les tags au-dessus d'un seuil de poids
   (valeur exacte : choix du builder, ex. `count >= 10` sur 100). Si au moins un tag est mappé,
   **seuls ces genres sont retenus** ; on s'arrête là.
2. Sinon, **Last.fm `artist.getTopTags`** (artiste principal), en ne gardant que les tags les plus
   forts (ex. top 5 au-dessus du seuil). Si au moins un tag est mappé, on s'arrête là.
3. Sinon, **genres Spotify de l'artiste principal** (`GET /artists/{id}`), en dernier recours.
4. Sinon, le titre est « non classé ».

Justification (choix du builder) : Last.fm est la seule source qui descend au niveau du titre, et ses
tags sont pondérés, ce qui permet d'écarter les tags marginaux. Les genres Spotify ne sont qu'au
niveau artiste, sans poids, souvent absents, et les ajouter systématiquement ferait entrer tout le
catalogue d'un artiste dans chacun de ses genres (playlists trop larges).

Le profil stocke aussi la **source utilisée** (titre / artiste Last.fm / artiste Spotify), affichable
dans l'aperçu.

Les résultats par artiste (tags Last.fm + genres Spotify) sont mis en cache séparément pour ne pas
refaire l'appel pour chaque titre du même artiste.

Le profil stocké par titre contient les tags bruts **et** les genres mappés, pour pouvoir
re-mapper sans refaire d'appels si la taxonomie change.

## 8. Cache et synchronisation

- Stockage IndexedDB : liste des titres likés (id, nom, artistes, album, date de sortie, date d'ajout),
  profils de genres par titre, cache par artiste.
- **Sync automatique** au lancement de l'app (et sur l'écran de création) : relire toute la liste
  `GET /me/tracks` (rapide : 50 titres par appel), comparer au cache :
  - nouveaux likes → analysés (genres) ;
  - titres retirés des likes → supprimés du cache.
- **Resync forcée** : bouton qui vide les profils de genres et relance l'analyse complète
  (utile si les tags Last.fm ont évolué).
- Volume : Steven a **~4 300 titres likés**. Avec ~4 req/s sur Last.fm, la première analyse
  prend environ **20 à 25 minutes** (un appel par titre + les appels artistes mis en cache).
  Les fois suivantes, seuls les nouveaux likes sont analysés.
- Analyse en arrière-plan avec **barre de progression** (x / N titres), l'app reste utilisable.
  L'écran de création indique si l'analyse est en cours / incomplète.
- Compteur visible : titres classés / non classés.
- *(Choix du builder)* L'analyse est **reprenable** : chaque profil est enregistré dès qu'il est
  calculé, donc fermer l'onglet ou recharger reprend là où on s'était arrêté.
- Gestion des erreurs réseau et du rate limit (HTTP 429 Spotify avec `Retry-After`, erreurs Last.fm) :
  retry avec attente, sans perdre la progression.

## 9. Filtre par année

- Basé sur `album.release_date` (précision année / mois / jour → on prend l'année).
- Limite assumée : un remaster ou une compilation porte la date de la réédition.

## 10. Écrans

- **Connexion** : bouton « Se connecter avec Spotify ».
- **Layout** à la Spotify : sidebar (Mes playlists, Créer depuis mes likes, état de la sync),
  zone principale.
- **Mes playlists** : grille/liste de cartes ; actions renommer (inline ou modal) et supprimer
  (modal de confirmation). Renommer masqué/désactivé pour les playlists dont on n'est pas propriétaire.
- **Créer depuis mes likes** : sélecteur de genre parent → sélecteur de sous-genre (optionnel,
  avec le nombre de titres par option si possible), années min/max, aperçu des titres, nom, bouton créer.
  Après création, lien vers la playlist dans Spotify.
  *(Choix du builder)* Les playlists créées sont **privées** par défaut.

## 11. Makefile

Cibles minimales, avec `make help` par défaut :

- `make install` — installe Node (via fnm, version de `.node-version`) si besoin et les dépendances
- `make dev` — serveur de dev sur `127.0.0.1:8888`
- `make build` — build de production
- `make preview` — sert le build sur `127.0.0.1:8888`
- `make lint`, `make typecheck`, `make test`
- `make clean` — supprime `dist/`, caches

## 12. Tests

- Tests unitaires (Vitest) sur la logique pure : normalisation et mapping des tags vers la taxonomie,
  filtrage genre/année, diff de synchronisation du cache.
- Pas de tests end-to-end en v1.

## 13. Git

Le dossier est vide et n'est pas encore un repo git. Steven décide de l'initialisation, des commits
et du remote (aucune opération git sans sa demande explicite).

## 14. Laissé au builder

Structure des dossiers, découpage des composants, librairie d'icônes, détails visuels,
seuil exact des tags Last.fm, contenu détaillé de la table d'alias.
