import { expect, test } from 'claude-code/testing'

import { count, dateLabel, dollars, emptyStats, isTestRun, modelLabel, recapOf, span, tilesOf, withCall, withStep, withTurn } from '../hooks/stats'
import type { Recap, Stats } from '../hooks/stats'

// Monday 5 January 2026, 12:00 UTC: the 5th in every time zone a test runs in.
const NOON = Date.UTC(2026, 0, 5, 12)
const MINUTE = 60_000

const calls = (stats: Stats, ...list: Parameters<typeof withCall>[1][]) => list.reduce(withCall, stats)
const at = (stats: Stats, cost: number | null = null) => recapOf(stats, { now: NOON, cwd: '/Users/ada/dev/claude-mods', cost, isSoFar: false })

/** A conversation that built something: every stat has a value. */
const built = (): Recap =>
  at(
    calls(
      withStep(withTurn(withTurn(emptyStats(1), 60 * MINUTE), 42 * MINUTE), { model: 'claude-opus-5-5', input_tokens: 100_000, output_tokens: 20_000, cache_read_input_tokens: 1_900_000, cache_creation_input_tokens: 80_000 }),
      { tool: 'Edit', filePath: '/a/x.ts', oldText: 'one\ntwo\nthree', newText: 'one\nTWO\n2.5\nthree' },
      { tool: 'Edit', filePath: '/a/x.ts', oldText: 'gone', newText: '' },
      { tool: 'Write', filePath: '/a/y.ts', newText: 'a\nb\nc\n' },
      { tool: 'Bash', command: 'bun test' },
      { tool: 'Bash', command: 'ls' },
      { tool: 'Agent' },
      { tool: 'Skill', skill: 'write-docs' },
      { tool: 'mcp__claude_ai_Gmail__search_threads' },
    ),
    7.4,
  )

test('adds up the time Claude worked across turns', () => {
  const recap = at(withTurn(withTurn(emptyStats(null), 60 * MINUTE), 42 * MINUTE))

  expect(recap.workedMs).toBe(102 * MINUTE)
  expect(recap.turns).toBe(2)
})

test('counts every tool call and names the most used', () => {
  const recap = at(calls(emptyStats(null), { tool: 'Read' }, { tool: 'Edit', filePath: '/a/x.ts' }, { tool: 'Read' }))

  expect(recap.toolCalls).toBe(3)
  expect(recap.topTool).toBe('Read')
})

test('breaks a tie for the most used tool by name', () => {
  expect(at(calls(emptyStats(null), { tool: 'Read' }, { tool: 'Bash', command: 'ls' })).topTool).toBe('Bash')
})

test('names an MCP tool without its server', () => {
  expect(at(calls(emptyStats(null), { tool: 'mcp__claude_ai_Gmail__search_threads' })).topTool).toBe('search_threads')
})

test('counts each edited file once', () => {
  expect(built().files).toBe(2)
})

test('counts the lines an edit added and removed, leaving the ones it kept', () => {
  const recap = at(calls(emptyStats(null), { tool: 'Edit', filePath: '/a/x.ts', oldText: 'one\ntwo\nthree', newText: 'one\nTWO\n2.5\nthree' }))

  expect([recap.added, recap.removed]).toEqual([2, 1])
})

test('counts a written file as lines added', () => {
  const recap = at(calls(emptyStats(null), { tool: 'Write', filePath: '/a/y.ts', newText: 'a\nb\nc\n' }))

  expect([recap.added, recap.removed]).toEqual([3, 0])
})

test('counts a deletion as lines removed', () => {
  const recap = at(calls(emptyStats(null), { tool: 'Edit', filePath: '/a/x.ts', oldText: 'gone\nalso gone', newText: '' }))

  expect([recap.added, recap.removed]).toEqual([0, 2])
})

test('tells a test run from another command', () => {
  for (const command of ['npm test', 'pnpm run test', 'npx vitest run', 'pytest -q', 'go test ./...', 'cargo test', 'claude plugin test mods/x', 'bun test']) {
    expect(isTestRun(command)).toBe(true)
  }
  for (const command of ['npm run build', 'git status', 'cat test.txt', 'ls tests']) {
    expect(isTestRun(command)).toBe(false)
  }
})

test('counts test runs, subagents, skills and connectors', () => {
  const recap = built()

  expect([recap.testRuns, recap.subagents, recap.skills, recap.connectors]).toEqual([1, 1, 1, 1])
})

test('counts a skill and a connector once however often they are used', () => {
  const recap = at(
    calls(emptyStats(null), { tool: 'Skill', skill: 'write-docs' }, { tool: 'Skill', skill: 'write-docs' }, { tool: 'mcp__gmail__search' }, { tool: 'mcp__gmail__send' }),
  )

  expect([recap.skills, recap.connectors]).toEqual([1, 1])
})

test('adds up the tokens of every request and keeps the model that answered last', () => {
  const recap = built()

  expect(recap.tokens).toBe(2_100_000)
  expect(recap.model).toBe('Opus 5.5')
})

test('reports what the conversation cost since it began', () => {
  expect(dollars(built().cost ?? 0)).toBe('$6.40')
})

test('reports no cost where nothing keeps count', () => {
  expect(at(withTurn(emptyStats(null), MINUTE)).cost).toBe(null)
  expect(at(withTurn(emptyStats(1), MINUTE)).cost).toBe(null)
})

test('names the project by its folder, never its path', () => {
  expect(built().project).toBe('claude-mods')
})

test('writes a duration the way a watch does', () => {
  expect(span(45_000)).toBe('45s')
  expect(span(14 * MINUTE)).toBe('14m')
  expect(span(102 * MINUTE)).toBe('1h 42m')
  expect(span(125 * MINUTE)).toBe('2h 5m')
  expect(span(120 * MINUTE)).toBe('2h')
})

test('writes a count in full up to 9,999 and short above', () => {
  expect(count(864)).toBe('864')
  expect(count(1_077)).toBe('1,077')
  expect(count(12_400)).toBe('12.4K')
  expect(count(2_100_000)).toBe('2.1M')
  expect(count(3_000_000_000)).toBe('3B')
})

test('writes dollars with cents, and without them from a hundred', () => {
  expect(dollars(6.4)).toBe('$6.40')
  expect(dollars(142.3)).toBe('$142')
})

test('writes a model id as its name', () => {
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelLabel('Opus 5.5')).toBe('Opus 5.5')
  expect(modelLabel('')).toBe('')
})

test('writes the date as day, month, year', () => {
  expect(dateLabel(NOON)).toBe('5 Jan 2026')
})

test('heads the card with the project, the date, the time worked and the turns', () => {
  expect(tilesOf(built()).headline).toEqual({ project: 'claude-mods', date: '5 Jan 2026', time: '1h 42m', note: '2 turns on Opus 5.5' })
})

test('says one turn in the singular, and leaves out a model it does not know', () => {
  expect(tilesOf(at(withTurn(emptyStats(null), MINUTE))).headline.note).toBe('1 turn')
})

test('puts tool calls on the accent tile', () => {
  expect(tilesOf(built()).accent).toEqual({ label: 'Tool calls', value: '8' })
})

test('fills the small tiles in order of what a builder cares about', () => {
  expect(tilesOf(built()).small).toEqual([
    { label: 'Files edited', value: '2' },
    { label: 'Lines', value: '+5', removed: '−2' },
    { label: 'Most used', value: 'Bash' },
    { label: 'Test runs', value: '1' },
    { label: 'Cost', value: '$6.40', note: '2.1M tokens' },
  ])
})

test('never shows a zero: a research conversation gets the tiles it earned', () => {
  const research = at(
    calls(withStep(withTurn(emptyStats(2), 9 * MINUTE), { model: 'claude-opus-5-5', input_tokens: 840_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), { tool: 'Read' }, { tool: 'Agent' }, {
      tool: 'mcp__gmail__search',
    }),
    3,
  )

  expect(tilesOf(research).small).toEqual([
    { label: 'Most used', value: 'Agent' },
    { label: 'Cost', value: '$1.00', note: '840K tokens' },
    { label: 'Subagents', value: '1' },
    { label: 'Connectors', value: '1' },
  ])
})

test('shows tokens in a tile of their own where cost is not known', () => {
  const recap = at(calls(withStep(withTurn(emptyStats(null), MINUTE), { model: 'm', input_tokens: 12_400, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), { tool: 'Read' }))

  expect(tilesOf(recap).small).toEqual([
    { label: 'Most used', value: 'Read' },
    { label: 'Tokens', value: '12.4K' },
  ])
})

test('puts tokens on the accent tile of a conversation that called no tool', () => {
  const chat = at(withStep(withTurn(emptyStats(1), MINUTE), { model: 'm', input_tokens: 12_400, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), 1.5)
  const tiles = tilesOf(chat)

  expect(tiles.accent).toEqual({ label: 'Tokens', value: '12.4K' })
  expect(tiles.small).toEqual([{ label: 'Cost', value: '$0.50' }])
})
