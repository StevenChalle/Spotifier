// Génère les PNG de l'app depuis public/icons/icon.svg (npm run icons).
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const dir = new URL('../public/icons/', import.meta.url)
const svg = await readFile(new URL('icon.svg', dir))

// Maskable : fond plein (jamais d'angles arrondis) et motif réduit pour tenir
// dans la zone de sécurité (cercle de 80 % du côté).
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#121212"/>
  <rect x="136" y="136" width="240" height="240" rx="60" fill="#1DB954"/>
  <rect x="195" y="257" width="27" height="80" rx="13.5" fill="#121212"/>
  <rect x="242" y="204" width="27" height="133" rx="13.5" fill="#121212"/>
  <rect x="289" y="231" width="27" height="106" rx="13.5" fill="#121212"/>
</svg>`)

const targets = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['maskable-512.png', maskable, 512],
]
for (const [name, source, size] of targets) {
  const png = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer()
  await writeFile(new URL(name, dir), png)
  console.log(`${name} (${size}x${size})`)
}
