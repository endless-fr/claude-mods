/** The pane's header: a card of rounded tiles in the manner of Session Recap. Free of any engine call. */

import type { ChangedFile } from '../types'

const WIDTH = 600
const EDGE = 12
const GAP = 10
const CORNER = 20
const HEIGHT = 168

const GROUND = '#000000'
const SURFACE = '#1C1C1E'
const INK = '#F5F5F7'
const GREY = '#8E8E93'
const ACCENT = '#0A84FF'
const PLUS = '#30D158'
const MINUS = '#FF453A'

const FACE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"

const REVEAL = { first: 0.05, step: 0.09, takes: 0.6, rise: 10 }

type Type = { size: number; fill?: string; weight?: number; tracking?: number; opacity?: number }

function text(x: number, y: number, content: string, { size, fill = INK, weight = 400, tracking = 0, opacity }: Type): string {
  const extras = `${tracking ? ` letter-spacing="${tracking}"` : ''}${opacity === undefined ? '' : ` fill-opacity="${opacity}"`}`

  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extras}>${content}</text>`
}

function reveal(order: number): string {
  const waits = REVEAL.first + order * REVEAL.step
  const ends = waits + REVEAL.takes
  const timing = `keyTimes="0;${(waits / ends).toFixed(3)};1" dur="${ends.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.16 1 0.3 1"`

  return (
    `<animate attributeName="opacity" values="0;0;1" ${timing}/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 ${REVEAL.rise};0 ${REVEAL.rise};0 0" ${timing}/>`
  )
}

function tile(order: number, x: number, width: number, fill: string, inside: string): string {
  const height = HEIGHT - EDGE * 2

  return `<g transform="translate(${x} ${EDGE})"><g>${reveal(order)}<rect width="${width}" height="${height}" rx="${CORNER}" fill="${fill}"/>${inside}</g></g>`
}

/** What a reader that cannot see the card is told. */
export function altOf(files: readonly ChangedFile[]): string {
  if (files.length === 0) return 'Aucune modification. Les fichiers modifiés par Claude apparaîtront ici.'

  return `${files.length} fichier${files.length > 1 ? 's' : ''} modifié${files.length > 1 ? 's' : ''} depuis votre dernier message`
}

export function headerSvg(files: readonly ChangedFile[]): string {
  const inner = HEIGHT - EDGE * 2
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FACE}">`
  const ground = `<rect width="${WIDTH}" height="${HEIGHT}" rx="${CORNER + EDGE / 2}" fill="${GROUND}"/>`

  if (files.length === 0) {
    const inside =
      text(20, 38, 'Fichiers modifiés', { size: 15, fill: GREY, weight: 500 }) +
      text(20, inner - 46, 'Aucune modification', { size: 28, weight: 600, tracking: -0.5 }) +
      text(20, inner - 18, 'Les fichiers modifiés par Claude apparaîtront ici.', { size: 14, fill: GREY })

    return `${open}${ground}${tile(0, EDGE, WIDTH - EDGE * 2, SURFACE, inside)}</svg>`
  }

  const added = files.reduce((sum, file) => sum + file.added, 0)
  const removed = files.reduce((sum, file) => sum + file.removed, 0)
  const first = Math.round((WIDTH - EDGE * 2 - GAP) * 0.55)
  const second = WIDTH - EDGE * 2 - GAP - first

  const count =
    text(20, 38, 'Fichiers modifiés', { size: 15, fill: '#FFFFFF', weight: 500, opacity: 0.86 }) +
    text(18, inner - 42, String(files.length), { size: 44, fill: '#FFFFFF', weight: 600, tracking: -1.4 }) +
    text(20, inner - 18, 'depuis votre dernier message', { size: 13, fill: '#FFFFFF', opacity: 0.86 })
  const lines =
    text(20, 38, 'Lignes', { size: 15, fill: GREY, weight: 500 }) +
    text(18, inner - 42, `<tspan fill="${PLUS}">+${added}</tspan> <tspan fill="${MINUS}" font-size="26">−${removed}</tspan>`, {
      size: 44,
      weight: 600,
      tracking: -1.2,
    }) +
    text(20, inner - 18, 'cliquez un fichier pour sa diff', { size: 13, fill: GREY })

  return `${open}${ground}${tile(0, EDGE, first, ACCENT, count)}${tile(1, EDGE + first + GAP, second, SURFACE, lines)}</svg>`
}
