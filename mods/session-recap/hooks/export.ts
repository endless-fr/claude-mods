/** The card as an image: the commands that draw it with the tools macOS ships with, then copy or save it. Free of any engine call: the hooks run what this lays out, and only when a button is pressed. */

import type { Recap } from '../types'
import { CARD, exportSvg } from './card'

// Two image pixels to each point of the card.
const SCALE = 2
const FOLDER = 'Session Recaps'

/** What drawing the card to a PNG takes: a file to write, commands to run in order, and the working files to remove after. */
export type Drawing = { svg: string; source: string; png: string; draw: string[][]; clean: string[] }

/** Lays out the drawing of `recap` in the temporary folder `tmpdir` names. */
export function drawingOf(recap: Recap, tmpdir: string | undefined): Drawing {
  const dir = `${(tmpdir ?? '/tmp').replace(/\/+$/, '')}/session-recap`
  const svg = `${dir}/card.svg`
  const square = `${svg}.png`
  const png = `${dir}/card.png`
  const side = String(CARD.width * SCALE)

  return {
    svg,
    source: exportSvg(recap),
    png,
    // Quick Look draws the system face, and only ever a square: sips cuts the card out of its middle.
    draw: [
      ['qlmanage', '-t', '-s', side, '-o', dir, svg],
      ['sips', '-c', String(CARD.height * SCALE), side, square, '--out', png],
    ],
    clean: ['rm', '-f', svg, square, png],
  }
}

/** The command that puts the PNG at `png` on the clipboard. */
export const copyOf = (png: string): string[] => ['osascript', '-e', `set the clipboard to (read (POSIX file "${png.replace(/[\\"]/g, c => `\\${c}`)}") as «class PNGf»)`]

const two = (value: number) => String(value).padStart(2, '0')

/** `2026-01-05-1407`, in the machine's own time. */
function stamp(ms: number): string {
  const date = new Date(ms)

  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`
}

/** What saving the PNG takes: the commands that file it under Pictures, and the one that shows it in the Finder. */
export function savingOf(recap: Recap, png: string, home: string): { where: string; file: string[][]; reveal: string[] } {
  const folder = `${home}/Pictures/${FOLDER}`
  const name = recap.project.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'session'
  const path = `${folder}/${name}-${stamp(recap.at)}.png`

  return {
    where: `Pictures › ${FOLDER}`,
    file: [
      ['mkdir', '-p', folder],
      ['cp', png, path],
    ],
    reveal: ['open', '-R', path],
  }
}
