// Taxonomie des genres et table d'alias (données pures, faciles à éditer).
//
// Conventions
// - Les alias sont des clés DÉJÀ normalisées (voir normalizeTag : minuscules, sans accents,
//   `-`/`_` -> espace). Un test vérifie que chaque clé est stable par normalisation.
// - Un alias pointe vers un GenreRef ; `sub` absent = parent seul.
//
// Décisions sur les tags ambigus
// - `indie`            -> Rock > Indie rock (usage dominant sur Last.fm ; `indie pop` reste Pop > Indie pop).
// - `alternative`      -> Rock > Alternative (idem `alternative rock`, `alt rock`).
//                         `alternative hip hop` est un alias explicite de Rap : sans lui, `alternative` (plus long
//                         que `hip hop`) l'emporterait. Pour tout tag composé inconnu, l'alias le plus long gagne.
// - `electronic`, `electronica`, `electro`, `edm` -> Électro (parent seul).
// - `soul`             -> R&B / Soul (parent seul) ; `classic soul`/`northern soul` -> Soul classique.
// - `rnb`, `r&b`       -> R&B / Soul (parent seul) ; `contemporary r&b` -> R&B contemporain.
// - `dance`            -> Électro (parent seul) ; `dance pop` -> Pop > Dance pop.
// - `pop rock`         -> Rock (parent seul) ; `pop punk` -> Rock > Punk.
// - `rap`, `hip hop`   -> Rap (parent seul) ; `french rap` etc. -> Rap > Rap FR.
// - `metal`            -> Metal (parent seul) ; `heavy metal` -> Metal > Heavy.
// - `singer songwriter` : non mappé (désigne un format, pas un genre).
// - `grime` -> Rap (parent seul) ; `uk garage` -> Électro (parent seul) : ni l'un ni l'autre n'est du dubstep.
// - `baroque pop` -> Pop ; `dub techno` -> Électro > Techno ; `lo fi`, `industrial`, `groove`, `minimal`,
//   `fusion`, `score`, `rage` : retirés (trop vagues ou faux positifs).
// - Alias « exact seulement » (EXACT_ONLY) : modificateurs ou génériques qui ne doivent pas gagner en
//   sous-chaîne (`jazz piano` -> Jazz, `acoustic rock` -> Rock, `brazilian funk` -> Funk...). Ils ne
//   matchent qu'un tag normalisé égal.
// - `latin` -> Latin (parent seul) ; `world`/`world music` non mappés (trop vagues).
// - Non mappés volontairement (trop vagues / non-genres) : `seen live`, `favorites`, `female vocalists`,
//   `chill`, `party`, `world`, `instrumental`, `oldies`, `80s`/`90s` (décennies), `new wave`, `experimental`.
// - Un seul genre est retenu par tag en cas de correspondance par sous-chaîne : alias le plus long, à
//   égalité sous-genre avant parent, puis ordre de déclaration.

export type ParentId =
  | 'rap'
  | 'rock'
  | 'pop'
  | 'electro'
  | 'rnb-soul'
  | 'jazz'
  | 'classical'
  | 'reggae'
  | 'metal'
  | 'funk-disco'
  | 'folk-country'
  | 'latin'
  | 'afro'
  | 'blues'
  | 'variete-chanson'

export type SubId =
  // rap
  | 'rap-fr'
  | 'trap'
  | 'drill'
  | 'boom-bap'
  | 'cloud-rap'
  | 'rap-us'
  // rock
  | 'indie-rock'
  | 'punk'
  | 'hard-rock'
  | 'classic-rock'
  | 'alternative'
  | 'grunge'
  // pop
  | 'indie-pop'
  | 'synthpop'
  | 'k-pop'
  | 'dance-pop'
  | 'pop-fr'
  // electro
  | 'house'
  | 'techno'
  | 'drum-and-bass'
  | 'dubstep'
  | 'ambient'
  | 'trance'
  | 'french-touch'
  // rnb-soul
  | 'rnb-contemporain'
  | 'neo-soul'
  | 'soul-classique'
  // jazz
  | 'jazz-fusion'
  | 'bebop'
  | 'smooth-jazz'
  | 'jazz-vocal'
  // classical
  | 'baroque'
  | 'romantique'
  | 'classique-contemporain'
  | 'film-score'
  // reggae
  | 'roots'
  | 'dancehall'
  | 'dub'
  | 'ska'
  // metal
  | 'heavy-metal'
  | 'thrash'
  | 'death-metal'
  | 'black-metal'
  | 'metalcore'
  // funk-disco
  | 'funk'
  | 'disco'
  | 'nu-disco'
  | 'boogie'
  // folk-country
  | 'folk'
  | 'country'
  | 'americana'
  // latin
  | 'reggaeton'
  | 'salsa'
  | 'bossa-nova'
  | 'latin-pop'
  // afro
  | 'afrobeats'
  | 'afrobeat'
  | 'amapiano'
  | 'coupe-decale'
  // variete-chanson
  | 'chanson-francaise'
  | 'variete-francaise'

export type GenreRef = { parent: ParentId; sub?: SubId }

export type TaxonomyEntry = {
  id: ParentId
  label: string
  subs: { id: SubId; label: string }[]
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    id: 'rap',
    label: 'Rap / Hip-hop',
    subs: [
      { id: 'rap-fr', label: 'Rap FR' },
      { id: 'trap', label: 'Trap' },
      { id: 'drill', label: 'Drill' },
      { id: 'boom-bap', label: 'Boom bap' },
      { id: 'cloud-rap', label: 'Cloud rap' },
      { id: 'rap-us', label: 'Rap US' },
    ],
  },
  {
    id: 'rock',
    label: 'Rock',
    subs: [
      { id: 'indie-rock', label: 'Indie rock' },
      { id: 'punk', label: 'Punk' },
      { id: 'hard-rock', label: 'Hard rock' },
      { id: 'classic-rock', label: 'Classic rock' },
      { id: 'alternative', label: 'Alternative' },
      { id: 'grunge', label: 'Grunge' },
    ],
  },
  {
    id: 'pop',
    label: 'Pop',
    subs: [
      { id: 'indie-pop', label: 'Indie pop' },
      { id: 'synthpop', label: 'Synthpop' },
      { id: 'k-pop', label: 'K-pop' },
      { id: 'dance-pop', label: 'Dance pop' },
      { id: 'pop-fr', label: 'Pop FR' },
    ],
  },
  {
    id: 'electro',
    label: 'Électro',
    subs: [
      { id: 'house', label: 'House' },
      { id: 'techno', label: 'Techno' },
      { id: 'drum-and-bass', label: 'Drum & bass' },
      { id: 'dubstep', label: 'Dubstep' },
      { id: 'ambient', label: 'Ambient' },
      { id: 'trance', label: 'Trance' },
      { id: 'french-touch', label: 'French touch' },
    ],
  },
  {
    id: 'rnb-soul',
    label: 'R&B / Soul',
    subs: [
      { id: 'rnb-contemporain', label: 'R&B contemporain' },
      { id: 'neo-soul', label: 'Neo soul' },
      { id: 'soul-classique', label: 'Soul classique' },
    ],
  },
  {
    id: 'jazz',
    label: 'Jazz',
    subs: [
      { id: 'jazz-fusion', label: 'Jazz fusion' },
      { id: 'bebop', label: 'Bebop' },
      { id: 'smooth-jazz', label: 'Smooth jazz' },
      { id: 'jazz-vocal', label: 'Jazz vocal' },
    ],
  },
  {
    id: 'classical',
    label: 'Classique',
    subs: [
      { id: 'baroque', label: 'Baroque' },
      { id: 'romantique', label: 'Romantique' },
      { id: 'classique-contemporain', label: 'Contemporain' },
      { id: 'film-score', label: 'Musique de film' },
    ],
  },
  {
    id: 'reggae',
    label: 'Reggae',
    subs: [
      { id: 'roots', label: 'Roots' },
      { id: 'dancehall', label: 'Dancehall' },
      { id: 'dub', label: 'Dub' },
      { id: 'ska', label: 'Ska' },
    ],
  },
  {
    id: 'metal',
    label: 'Metal',
    subs: [
      { id: 'heavy-metal', label: 'Heavy' },
      { id: 'thrash', label: 'Thrash' },
      { id: 'death-metal', label: 'Death' },
      { id: 'black-metal', label: 'Black' },
      { id: 'metalcore', label: 'Metalcore' },
    ],
  },
  {
    id: 'funk-disco',
    label: 'Funk / Disco',
    subs: [
      { id: 'funk', label: 'Funk' },
      { id: 'disco', label: 'Disco' },
      { id: 'nu-disco', label: 'Nu-disco' },
      { id: 'boogie', label: 'Boogie' },
    ],
  },
  {
    id: 'folk-country',
    label: 'Folk / Country',
    subs: [
      { id: 'folk', label: 'Folk' },
      { id: 'country', label: 'Country' },
      { id: 'americana', label: 'Americana' },
    ],
  },
  {
    id: 'latin',
    label: 'Latin',
    subs: [
      { id: 'reggaeton', label: 'Reggaeton' },
      { id: 'salsa', label: 'Salsa' },
      { id: 'bossa-nova', label: 'Bossa nova' },
      { id: 'latin-pop', label: 'Latin pop' },
    ],
  },
  {
    id: 'afro',
    label: 'Afro',
    subs: [
      { id: 'afrobeats', label: 'Afrobeats' },
      { id: 'afrobeat', label: 'Afrobeat' },
      { id: 'amapiano', label: 'Amapiano' },
      { id: 'coupe-decale', label: 'Coupé-décalé' },
    ],
  },
  { id: 'blues', label: 'Blues', subs: [] },
  {
    id: 'variete-chanson',
    label: 'Variété / Chanson',
    subs: [
      { id: 'chanson-francaise', label: 'Chanson française' },
      { id: 'variete-francaise', label: 'Variété française' },
    ],
  },
]

function build(entries: [ParentId, SubId | undefined, string[]][]): Record<string, GenreRef> {
  const out: Record<string, GenreRef> = {}
  for (const [parent, sub, aliases] of entries) {
    for (const alias of aliases) out[alias] = sub === undefined ? { parent } : { parent, sub }
  }
  return out
}

// Clés normalisées. L'ordre de déclaration sert de départage final dans mapTags.
export const ALIASES: Record<string, GenreRef> = build([
  // --- Rap / Hip-hop
  ['rap', undefined, ['rap', 'hip hop', 'hiphop', 'hip hop rap', 'rap hip hop', 'gangsta rap', 'conscious hip hop', 'grime', 'east coast hip hop', 'underground hip hop', 'alternative hip hop']],
  ['rap', 'rap-fr', ['french hip hop', 'french rap', 'rap francais', 'rap fr', 'hip hop francais']],
  ['rap', 'trap', ['trap', 'trap music', 'trap rap', 'trap francais', 'latin trap']],
  ['rap', 'drill', ['drill', 'uk drill', 'chicago drill', 'brooklyn drill', 'french drill', 'ny drill']],
  ['rap', 'boom-bap', ['boom bap', 'boombap', 'jazz rap', 'old school hip hop', 'golden age hip hop']],
  ['rap', 'cloud-rap', ['cloud rap', 'emo rap', 'sad rap']],
  ['rap', 'rap-us', ['us rap', 'american rap', 'west coast hip hop', 'west coast rap', 'southern hip hop', 'dirty south', 'hardcore hip hop']],
  // --- Rock
  ['rock', undefined, ['rock', 'rock and roll', 'rock n roll', 'pop rock', 'soft rock', 'garage rock', 'psychedelic rock', 'progressive rock', 'prog rock', 'post rock', 'post punk', 'emo', 'shoegaze', 'surf rock', 'rockabilly', 'french rock', 'rock francais']],
  ['rock', 'indie-rock', ['indie', 'indie rock']],
  ['rock', 'punk', ['punk', 'punk rock', 'pop punk', 'hardcore punk', 'hardcore', 'skate punk', 'post hardcore']],
  ['rock', 'hard-rock', ['hard rock', 'glam rock', 'glam metal', 'arena rock', 'stoner rock']],
  ['rock', 'classic-rock', ['classic rock', '70s rock', '60s rock', 'blues rock']],
  ['rock', 'alternative', ['alternative', 'alternative rock', 'alt rock', 'britpop', 'alternative indie']],
  ['pop', undefined, ['alternative pop']],
  ['rock', 'grunge', ['grunge', 'seattle grunge']],
  // --- Pop
  ['pop', undefined, ['pop', 'pop music', 'electropop', 'art pop', 'teen pop', 'power pop', 'chamber pop', 'dream pop', 'bubblegum pop', 'europop', 'pop soul', 'adult contemporary', 'baroque pop']],
  ['pop', 'indie-pop', ['indie pop', 'twee pop', 'jangle pop', 'bedroom pop']],
  ['pop', 'synthpop', ['synthpop', 'synth pop', 'new romantic', 'futurepop']],
  ['pop', 'k-pop', ['k pop', 'kpop', 'korean pop', 'j pop', 'jpop']],
  ['pop', 'dance-pop', ['dance pop', 'dancepop']],
  ['pop', 'pop-fr', ['pop francaise', 'french pop', 'pop fr']],
  // --- Électro
  ['electro', undefined, ['electronic', 'electronica', 'electro', 'edm', 'dance', 'electronic dance music', 'idm', 'downtempo', 'trip hop', 'chillout', 'alternative dance', 'uk garage', 'synthwave', 'breakbeat', 'electroclash', 'glitch', 'hardstyle', 'big beat', 'future bass']],
  ['electro', 'house', ['house', 'deep house', 'tech house', 'progressive house', 'electro house', 'tropical house', 'acid house', 'chicago house', 'funky house', 'future house', 'afro house', 'melodic house', 'house music']],
  ['electro', 'techno', ['techno', 'minimal techno', 'detroit techno', 'acid techno', 'hard techno', 'dub techno', 'melodic techno']],
  ['electro', 'drum-and-bass', ['drum and bass', 'dnb', 'drum n bass', 'drum bass', 'jungle', 'liquid funk', 'neurofunk']],
  ['electro', 'dubstep', ['dubstep', 'brostep', 'riddim']],
  ['electro', 'ambient', ['ambient', 'dark ambient', 'drone', 'new age', 'chillwave', 'ambient electronic']],
  ['electro', 'trance', ['trance', 'psytrance', 'psychedelic trance', 'goa trance', 'progressive trance', 'uplifting trance', 'vocal trance']],
  ['electro', 'french-touch', ['french touch', 'french house', 'filter house']],
  // --- R&B / Soul
  ['rnb-soul', undefined, ['rnb', 'r and b', 'rhythm and blues', 'soul', 'urban', 'new jack swing', 'quiet storm', 'gospel']],
  ['rnb-soul', 'rnb-contemporain', ['contemporary r and b', 'contemporary rnb', 'alternative r and b', 'alternative rnb', 'pop r and b', 'pbr and b']],
  ['rnb-soul', 'neo-soul', ['neo soul', 'neosoul', 'nu soul']],
  ['rnb-soul', 'soul-classique', ['classic soul', 'northern soul', 'motown', 'southern soul', 'old school soul', 'soul classique', '60s soul']],
  // --- Jazz
  ['jazz', undefined, ['jazz', 'cool jazz', 'modern jazz', 'swing', 'big band', 'acid jazz', 'latin jazz', 'nu jazz', 'free jazz', 'hard bop', 'post bop', 'jazz funk', 'gypsy jazz']],
  ['jazz', 'jazz-fusion', ['jazz fusion']],
  ['jazz', 'bebop', ['bebop', 'bop']],
  ['jazz', 'smooth-jazz', ['smooth jazz', 'lounge', 'easy listening']],
  ['jazz', 'jazz-vocal', ['jazz vocal', 'vocal jazz', 'jazz vocals', 'jazz singer', 'traditional pop']],
  // --- Classique
  ['classical', undefined, ['classical', 'classique', 'classical music', 'opera', 'orchestral', 'symphony', 'piano', 'chamber music', 'choral', 'neoclassical', 'minimalism', 'modern classical']],
  ['classical', 'baroque', ['baroque', 'early music', 'renaissance']],
  ['classical', 'romantique', ['romantic', 'romantic classical', 'late romantic', 'romantic era']],
  ['classical', 'classique-contemporain', ['contemporary classical', 'classical contemporary', '20th century classical', 'avant garde classical']],
  ['classical', 'film-score', ['soundtrack', 'film score', 'movie soundtrack', 'ost', 'film music', 'cinematic', 'video game music']],
  // --- Reggae
  ['reggae', undefined, ['reggae', 'reggae fusion', 'lovers rock', 'reggae pop', 'jamaican']],
  ['reggae', 'roots', ['roots reggae', 'roots', 'rastafari']],
  ['reggae', 'dancehall', ['dancehall', 'ragga', 'raggamuffin', 'dembow']],
  ['reggae', 'dub', ['dub', 'dub reggae']],
  ['reggae', 'ska', ['ska', 'ska punk', 'two tone', 'rocksteady', 'third wave ska']],
  // --- Metal
  ['metal', undefined, ['metal', 'nu metal', 'alternative metal', 'industrial metal', 'power metal', 'progressive metal', 'doom metal', 'symphonic metal', 'folk metal', 'gothic metal', 'groove metal', 'hair metal']],
  ['metal', 'heavy-metal', ['heavy metal', 'classic metal', 'nwobhm', 'traditional heavy metal']],
  ['metal', 'thrash', ['thrash', 'thrash metal', 'speed metal', 'crossover thrash']],
  ['metal', 'death-metal', ['death metal', 'melodic death metal', 'technical death metal', 'deathcore', 'brutal death metal']],
  ['metal', 'black-metal', ['black metal', 'symphonic black metal', 'atmospheric black metal', 'blackgaze']],
  ['metal', 'metalcore', ['metalcore', 'melodic metalcore', 'mathcore', 'screamo']],
  // --- Funk / Disco
  ['funk-disco', undefined, ['funk soul', 'p funk', 'go go', 'afro funk']],
  ['funk-disco', 'funk', ['funk', 'funk rock', 'funk metal', 'g funk', 'funky']],
  ['funk-disco', 'disco', ['disco', 'disco funk', 'italo disco', 'eurodisco', 'euro disco', 'hi nrg']],
  ['funk-disco', 'nu-disco', ['nu disco', 'nudisco', 'disco house', 'space disco', 'indie dance']],
  ['funk-disco', 'boogie', ['boogie', 'boogie funk', 'electro funk', 'post disco', 'modern soul']],
  // --- Folk / Country
  ['folk-country', undefined, ['folk pop', 'indie folk', 'folk rock', 'acoustic', 'celtic', 'bluegrass', 'traditional folk', 'neofolk', 'freak folk', 'anti folk']],
  ['folk-country', 'folk', ['folk', 'folk music', 'contemporary folk', 'british folk']],
  ['folk-country', 'country', ['country', 'country pop', 'country rock', 'classic country', 'outlaw country', 'alt country', 'alternative country', 'honky tonk', 'country music', 'nashville']],
  ['folk-country', 'americana', ['americana', 'roots rock', 'southern rock', 'heartland rock', 'appalachian']],
  // --- Latin
  ['latin', undefined, ['latin', 'latin music', 'musica latina', 'latino', 'cumbia', 'bachata', 'merengue', 'tango', 'mariachi', 'flamenco', 'tropical', 'mambo', 'son cubano', 'urbano latino', 'latin hip hop']],
  ['latin', 'reggaeton', ['reggaeton', 'regueton', 'perreo', 'moombahton']],
  ['latin', 'salsa', ['salsa', 'salsa cubana', 'timba', 'salsa romantica']],
  ['latin', 'bossa-nova', ['bossa nova', 'bossanova', 'mpb', 'samba', 'brazilian', 'tropicalia', 'samba jazz']],
  ['latin', 'latin-pop', ['latin pop', 'pop latino', 'latin ballad', 'spanish pop', 'pop en espanol']],
  // --- Afro
  ['afro', undefined, ['afro', 'african', 'african music', 'afro pop', 'afropop', 'highlife', 'soukous', 'mbalax', 'makossa', 'ndombolo', 'afro soul', 'naija', 'afro fusion', 'gqom', 'kuduro', 'azonto', 'rai', 'gnawa']],
  ['afro', 'afrobeats', ['afrobeats', 'afro beats', 'afro swing', 'afroswing', 'nigerian pop', 'naija pop']],
  ['afro', 'afrobeat', ['afrobeat', 'fela kuti', 'afro beat', 'ethio jazz']],
  ['afro', 'amapiano', ['amapiano', 'south african house', 'kwaito']],
  ['afro', 'coupe-decale', ['coupe decale', 'coupedecale', 'zouglou', 'afro trap', 'nouchi']],
  // --- Blues
  ['blues', undefined, ['blues', 'delta blues', 'chicago blues', 'electric blues', 'country blues', 'texas blues', 'blues jazz', 'piedmont blues', 'soul blues', 'modern blues', 'jump blues', 'british blues']],
  // --- Variété / Chanson
  ['variete-chanson', undefined, ['variete', 'chanson', 'french music', 'musique francaise', 'francophone']],
  ['variete-chanson', 'chanson-francaise', ['chanson francaise', 'french chanson', 'chanson realiste', 'nouvelle chanson francaise', 'chanson a texte', 'french song', 'chanson francophone']],
  ['variete-chanson', 'variete-francaise', ['variete francaise', 'variete fr', 'french variete', 'chanson variete', 'variete internationale']],
])

// Alias qui ne matchent qu'un tag entier (jamais en sous-chaîne). Les clés doivent exister dans ALIASES.
export const EXACT_ONLY: ReadonlySet<string> = new Set([
  'piano', 'opera', 'orchestral', 'symphony', 'choral', 'classique', 'chanson', 'variete',
  'brazilian', 'african', 'jamaican', 'latino', 'tropical', 'acoustic', 'celtic', 'nashville',
  'hardcore', 'francophone', 'alternative', 'indie', 'soul', 'urban', 'dance', 'electro', 'swing',
  'bop', 'ost', 'cinematic', 'lounge', 'easy listening', 'roots', 'jungle', 'funky', 'drone',
  'afro', 'gospel', 'dub', 'ska', 'emo', 'tango', 'rai',
])
