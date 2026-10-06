/** The recap as one drawing: a bento card of rounded tiles, animated for the pane and still for the image. Free of any engine call. */

import { SMALL_TILES, tilesOf } from './stats'
import type { Headline, Recap, Tile } from './stats'

export const CARD = { width: 1200, height: 675 }

const EDGE = 24
const GAP = 12
const COLUMNS = [484, 322, 322]
const ROW = 201
const CORNER = 28

const GROUND = '#000000'
const SURFACE = '#1C1C1E'
const INK = '#F5F5F7'
const GREY = '#8E8E93'
const ACCENT = '#0A84FF'
const PLUS = '#30D158'
const MINUS = '#FF453A'

// The system face: San Francisco in the Desktop app and under Quick Look.
const FACE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"
// What one character of a semibold figure takes of its size, tracking included.
const ADVANCE = 0.56

// One tile after another: when the first starts, what each waits on the last, and how long one takes.
const REVEAL = { first: 0.1, step: 0.09, takes: 0.7, rise: 16 }

/** One tile's place on the grid of three columns and three rows, and what it shows. */
export type Cell =
  | { kind: 'headline' | 'credit'; column: number; row: number; columns: number; rows: number }
  | { kind: 'accent' | 'small'; column: number; row: number; columns: number; rows: number; tile: Tile }

// Where the small tiles go, in the order they are filled.
const SLOTS = [
  [2, 0],
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
] as const

/**
 * Where each tile stands. With fewer than five small tiles the card closes
 * up, so no cell is left empty and no tile shows a zero.
 */
export function layoutOf(recap: Recap): Cell[] {
  const { accent, small } = tilesOf(recap)
  const count = Math.min(small.length, SMALL_TILES)
  const one = (kind: 'small' | 'accent', tile: Tile, column: number, row: number, columns = 1, rows = 1): Cell => ({ kind, column, row, columns, rows, tile })
  // The fourth of four takes the last cell, the credit having taken the one before it.
  const slots = count === 4 ? [SLOTS[0], SLOTS[1], SLOTS[2], SLOTS[4]] : SLOTS
  const smalls =
    count <= 2
      ? [...(count === 2 ? [one('small', small[0] as Tile, 2, 0)] : []), ...(count >= 1 ? [one('small', small[count - 1] as Tile, 1, 1, 2)] : [])]
      : small.slice(0, count).map((tile, i) => one('small', tile, slots[i]?.[0] ?? 2, slots[i]?.[1] ?? 2))

  return [
    { kind: 'headline', column: 0, row: 0, columns: 1, rows: 2 },
    one('accent', accent, 1, 0, count <= 1 ? 2 : 1, count === 0 ? 2 : 1),
    ...smalls,
    { kind: 'credit', column: 0, row: 2, columns: count === 5 ? 1 : count === 4 ? 2 : 3, rows: 1 },
  ]
}

const escape = (text: string) => text.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c)

const cut = (text: string, most: number) => (text.length > most ? `${text.slice(0, most)}…` : text)

/** The size at which `text` fits `width`, no larger than `size` and no smaller than `least`. */
const fit = (text: string, width: number, size: number, least: number) => Math.max(least, Math.min(size, Math.floor((width / (Math.max(1, text.length) * ADVANCE)) * 10) / 10))

type Type = { size: number; fill?: string; weight?: number; tracking?: number; opacity?: number }

function text(x: number, y: number, content: string, { size, fill = INK, weight = 400, tracking = 0, opacity }: Type): string {
  const extras = `${tracking ? ` letter-spacing="${tracking}"` : ''}${opacity === undefined ? '' : ` fill-opacity="${opacity}"`}`

  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${extras}>${content}</text>`
}

const span = (column: number, columns: number) => COLUMNS.slice(column, column + columns).reduce((sum, width) => sum + width, 0) + GAP * (columns - 1)
const left = (column: number) => EDGE + COLUMNS.slice(0, column).reduce((sum, width) => sum + width + GAP, 0)

function drawHeadline(headline: Headline, width: number, height: number): string {
  const inset = 32
  const size = fit(headline.time, width - 2 * inset, 128, 64)

  return (
    text(inset, 60, escape(cut(headline.project, 24)), { size: 27, weight: 600, tracking: -0.3 }) +
    text(inset, 92, escape(headline.date), { size: 21, fill: GREY }) +
    text(inset - 4, height - 78, escape(headline.time), { size, weight: 600, tracking: -size * 0.035 }) +
    text(inset, height - 34, escape(headline.note), { size: 23, fill: GREY })
  )
}

function drawTile(tile: Tile, isAccent: boolean, width: number, height: number): string {
  const inset = 28
  const room = width - 2 * inset
  const shown = cut(tile.value, 20)
  // The removed lines are written smaller, after a space.
  const length = tile.removed ? `${shown} ${tile.removed}`.length - tile.removed.length * 0.4 : shown.length
  const size = fit('x'.repeat(Math.ceil(length)), room, 58, 24)
  const value = tile.removed
    ? `<tspan fill="${PLUS}">${escape(shown)}</tspan> <tspan fill="${MINUS}" font-size="${Math.round(size * 0.6)}">${escape(tile.removed)}</tspan>`
    : escape(shown)
  const base = height - (tile.note ? 62 : 32)

  return (
    text(inset, 52, escape(tile.label), isAccent ? { size: 21, fill: '#FFFFFF', opacity: 0.86, weight: 500 } : { size: 21, fill: GREY, weight: 500 }) +
    text(inset - 2, base, value, { size, weight: 600, fill: isAccent ? '#FFFFFF' : INK, tracking: -size * 0.03 }) +
    (tile.note ? text(inset, height - 28, escape(tile.note), { size: 19, fill: isAccent ? '#FFFFFF' : GREY, ...(isAccent ? { opacity: 0.86 } : {}) }) : '')
  )
}

// The mod's mark: a bento of four, one tile lit.
const MARK = [0, 1, 2, 3].map(i => `<rect x="${28 + (i % 2) * 15}" y="${30 + Math.floor(i / 2) * 15}" width="12" height="12" rx="3.5" fill="${i === 1 ? ACCENT : '#48484A'}"/>`).join('')

function drawCredit(height: number): string {
  return MARK + text(28, height - 60, 'Session Recap', { size: 24, weight: 600, tracking: -0.2 }) + text(28, height - 30, 'by endless · Claude Code', { size: 19, fill: GREY })
}

/** How a tile comes in: unseen until its turn, then up into place. A surface that does not animate shows it as drawn. */
function reveal(order: number): string {
  const waits = REVEAL.first + order * REVEAL.step
  const ends = waits + REVEAL.takes
  const timing = `keyTimes="0;${(waits / ends).toFixed(3)};1" dur="${ends.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.16 1 0.3 1"`

  return (
    `<animate attributeName="opacity" values="0;0;1" ${timing}/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 ${REVEAL.rise};0 ${REVEAL.rise};0 0" ${timing}/>`
  )
}

function body(recap: Recap, isAnimated: boolean): string {
  const { headline } = tilesOf(recap)

  return layoutOf(recap)
    .map((cell, order) => {
      const width = span(cell.column, cell.columns)
      const height = ROW * cell.rows + GAP * (cell.rows - 1)
      const inside =
        'tile' in cell ? drawTile(cell.tile, cell.kind === 'accent', width, height) : cell.kind === 'headline' ? drawHeadline(headline, width, height) : drawCredit(height)
      const tile = `<rect width="${width}" height="${height}" rx="${CORNER}" fill="${cell.kind === 'accent' ? ACCENT : SURFACE}"/>${inside}`

      return `<g transform="translate(${left(cell.column)} ${EDGE + cell.row * (ROW + GAP)})">${isAnimated ? `<g>${reveal(order)}${tile}</g>` : tile}</g>`
    })
    .join('')
}

const open = (width: number, height: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FACE}">`

/** The card as the pane shows it, its tiles coming in one after another. */
export function cardSvg(recap: Recap): string {
  return `${open(CARD.width, CARD.height)}<rect width="${CARD.width}" height="${CARD.height}" rx="${CORNER + EDGE / 2}" fill="${GROUND}"/>${body(recap, true)}</svg>`
}

/**
 * The card as the image is made from it: still, and centred on a square of
 * its own ground, because Quick Look draws a square and the frame is cut out
 * of it afterwards.
 */
export function exportSvg(recap: Recap): string {
  const side = CARD.width

  return `${open(side, side)}<rect width="${side}" height="${side}" fill="${GROUND}"/><g transform="translate(0 ${(side - CARD.height) / 2})">${body(recap, false)}</g></svg>`
}
