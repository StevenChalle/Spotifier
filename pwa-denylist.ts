// Workbox teste la denylist sur pathname + search. Regex ancrée sur le pathname :
// les fichiers (sw.js, manifest, icônes) ne reçoivent pas index.html, mais
// /callback?code=abc.def (point dans la query) le reçoit.
export const NAV_FALLBACK_DENYLIST = /^\/[^?]*\.[a-z0-9]+(\?|$)/i
