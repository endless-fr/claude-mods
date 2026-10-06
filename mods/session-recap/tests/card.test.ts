import { expect, test } from 'claude-code/testing'

import { CARD, cardSvg, exportSvg, layoutOf } from '../hooks/card'
import type { Recap } from '../hooks/stats'

const NOON = Date.UTC(2026, 0, 5, 12)

const BUILT: Recap = {
  project: 'claude-mods',
  at: NOON,
  model: 'Opus 5.5',
  workedMs: 102 * 60_000,
  turns: 23,
  toolCalls: 148,
  topTool: 'Edit',
  files: 12,
  added: 864,
  removed: 213,
  testRuns: 9,
  subagents: 2,
  skills: 1,
  connectors: 0,
  tokens: 2_100_000,
  cost: 6.4,
  isSoFar: false,
}

/** The texts a drawing shows, in the order written. */
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(match => (match[1] ?? '').replace(/<[^>]+>/g, ''))

/** The cells a layout covers, as `column,row`, and how many tiles claim each. */
function covered(recap: Recap): Map<string, number> {
  const cells = new Map<string, number>()
  for (const cell of layoutOf(recap)) {
    for (let column = cell.column; column < cell.column + cell.columns; column++) {
      for (let row = cell.row; row < cell.row + cell.rows; row++) cells.set(`${column},${row}`, (cells.get(`${column},${row}`) ?? 0) + 1)
    }
  }

  return cells
}

test('draws a 16:9 card', () => {
  expect(cardSvg(BUILT)).toContain(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 1200 675"`)
})

test('shows the project, the time worked, the turns and the credit', () => {
  const shown = texts(cardSvg(BUILT))

  for (const text of ['claude-mods', '5 Jan 2026', '1h 42m', '23 turns on Opus 5.5', 'Session Recap', 'by endless · Claude Code']) expect(shown).toContain(text)
})

test('shows every tile with its label and its value', () => {
  const shown = texts(cardSvg(BUILT))

  for (const text of ['Tool calls', '148', 'Files edited', '12', 'Lines', '+864 −213', 'Most used', 'Edit', 'Test runs', '9', 'Cost', '$6.40', '2.1M tokens']) expect(shown).toContain(text)
})

test('marks a conversation still running', () => {
  expect(texts(cardSvg({ ...BUILT, isSoFar: true }))).toContain('So far · 5 Jan 2026')
})

test('covers the whole grid with no two tiles on one cell, whatever the conversation earned', () => {
  const lean: Partial<Recap>[] = [
    {},
    { testRuns: 0, subagents: 0, skills: 0 },
    { testRuns: 0, subagents: 0, skills: 0, files: 0, added: 0, removed: 0 },
    { testRuns: 0, subagents: 0, skills: 0, files: 0, added: 0, removed: 0, cost: null, tokens: 0 },
    { testRuns: 0, subagents: 0, skills: 0, files: 0, added: 0, removed: 0, toolCalls: 0, topTool: null },
    { testRuns: 0, subagents: 0, skills: 0, files: 0, added: 0, removed: 0, toolCalls: 0, topTool: null, cost: null },
  ]

  for (const less of lean) {
    const cells = covered({ ...BUILT, ...less })
    expect(cells.size).toBe(9)
    expect([...cells.values()].every(claims => claims === 1)).toBe(true)
  }
})

test('widens the credit tile when a small tile has nothing to say', () => {
  const credit = layoutOf({ ...BUILT, testRuns: 0, subagents: 0, skills: 0 }).find(cell => cell.kind === 'credit')

  expect(credit).toMatchObject({ column: 0, row: 2, columns: 2 })
})

test('gives a lone small tile the whole second row and the accent the whole first', () => {
  const cells = layoutOf({ ...BUILT, testRuns: 0, subagents: 0, skills: 0, files: 0, added: 0, removed: 0, cost: null, tokens: 0 })

  expect(cells.find(cell => cell.kind === 'accent')).toMatchObject({ column: 1, row: 0, columns: 2 })
  expect(cells.find(cell => cell.kind === 'small')).toMatchObject({ column: 1, row: 1, columns: 2 })
  expect(cells.find(cell => cell.kind === 'credit')).toMatchObject({ column: 0, row: 2, columns: 3 })
})

test('escapes a project name that is not plain text', () => {
  const svg = cardSvg({ ...BUILT, project: 'r&d <new>' })

  expect(svg).toContain('r&amp;d &lt;new&gt;')
  expect(svg).not.toContain('<new>')
})

test('shortens a project name too long for its tile', () => {
  const shown = texts(cardSvg({ ...BUILT, project: 'a-very-long-repository-name-that-goes-on-and-on' }))

  expect(shown).toContain('a-very-long-repository-n…')
})

test('shrinks a long value to fit its tile', () => {
  const size = (svg: string, value: string) => Number(new RegExp(`font-size="([\\d.]+)"[^>]*>${value}<`).exec(svg)?.[1])

  expect(size(cardSvg({ ...BUILT, topTool: 'notion-create-pages' }), 'notion-create-pages')).toBeLessThan(size(cardSvg(BUILT), 'Edit'))
})

test('stays within what a surface accepts as one drawing', () => {
  expect(cardSvg(BUILT).length).toBeLessThan(131_072)
})

test('brings the tiles in one after another', () => {
  const ends = [...cardSvg(BUILT).matchAll(/<animate [^>]*dur="([\d.]+)s"/g)].map(match => Number(match[1]))

  expect(ends.length).toBe(8)
  expect(ends).toEqual([...ends].sort((a, b) => a - b))
  expect(new Set(ends).size).toBe(8)
})

test('leaves every tile visible where a surface does not animate', () => {
  expect(cardSvg(BUILT)).not.toContain('opacity="0"')
})

test('exports the card still, centred on the square Quick Look draws', () => {
  const svg = exportSvg(BUILT)

  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"')
  expect(svg).toContain('<g transform="translate(0 262.5)">')
  expect(svg).not.toContain('<animate')
  expect(texts(svg)).toContain('1h 42m')
})
