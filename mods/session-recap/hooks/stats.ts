/** What a conversation did: the counts the hooks feed, the recap frozen from them, and how its numbers read. Free of any drawing or engine call. */

import type { Recap, Stats } from '../types'

export type { Recap, Stats }

/** One finished tool call, as much of it as the counts need. */
export type Call = {
  tool: string
  filePath?: string | undefined
  /** What an edit replaced and what it wrote; a written file has only the second. */
  oldText?: string | undefined
  newText?: string | undefined
  command?: string | undefined
  skill?: string | undefined
}

/** One request's token counts, as the API spells them. */
export type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export type Tile = { label: string; value: string; note?: string; removed?: string }
export type Headline = { project: string; date: string; time: string; note: string }
export type Tiles = { headline: Headline; accent: Tile; small: Tile[] }

export const SMALL_TILES = 5

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SUBAGENTS = new Set(['Agent', 'Task'])
const TEST_RUN =
  /\b(vitest|jest|mocha|pytest|rspec|phpunit|playwright\s+test|go\s+test|cargo\s+test|bun\s+test|deno\s+test|claude\s+plugin\s+test|(npm|pnpm|yarn)\s+(run\s+)?test\b|npm\s+t\b)/

export const isTestRun = (command: string) => TEST_RUN.test(command)

export const emptyStats = (costAtStart: number | null): Stats => ({
  costAtStart,
  workedMs: 0,
  turns: 0,
  tools: {},
  files: [],
  added: 0,
  removed: 0,
  testRuns: 0,
  subagents: 0,
  skills: [],
  connectors: [],
  tokens: 0,
  model: '',
})

const linesOf = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))

/** The lines an edit added and removed, the ones it kept at either end left out. An estimate, not a diff. */
function changed(oldText: string, newText: string): { added: number; removed: number } {
  const before = linesOf(oldText)
  const after = linesOf(newText)
  const most = Math.min(before.length, after.length)
  let head = 0
  while (head < most && before[head] === after[head]) head++
  let tail = 0
  while (tail < most - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++

  return { added: after.length - head - tail, removed: before.length - head - tail }
}

/** `mcp__claude_ai_Gmail__search_threads` is the server `claude_ai_Gmail` and the tool `search_threads`. */
function mcp(tool: string): { server: string; name: string } | null {
  const parts = tool.split('__')

  return parts[0] === 'mcp' && parts.length >= 3 ? { server: parts[1] ?? '', name: parts.slice(2).join('__') } : null
}

const once = (list: string[], one: string | undefined) => (one && !list.includes(one) ? [...list, one] : list)

/** Folds one finished tool call into the counts. */
export function withCall(stats: Stats, call: Call): Stats {
  const isEdit = EDITS.has(call.tool)
  const lines = isEdit && call.newText !== undefined ? changed(call.oldText ?? '', call.newText) : { added: 0, removed: 0 }

  return {
    ...stats,
    tools: { ...stats.tools, [call.tool]: (stats.tools[call.tool] ?? 0) + 1 },
    files: isEdit ? once(stats.files, call.filePath) : stats.files,
    added: stats.added + lines.added,
    removed: stats.removed + lines.removed,
    testRuns: stats.testRuns + (call.tool === 'Bash' && call.command && isTestRun(call.command) ? 1 : 0),
    subagents: stats.subagents + (SUBAGENTS.has(call.tool) ? 1 : 0),
    skills: call.tool === 'Skill' ? once(stats.skills, call.skill) : stats.skills,
    connectors: once(stats.connectors, mcp(call.tool)?.server),
  }
}

/** Folds one finished turn of the main conversation into the counts. */
export const withTurn = (stats: Stats, durationMs: number): Stats => ({ ...stats, turns: stats.turns + 1, workedMs: stats.workedMs + Math.max(0, durationMs) })

/** Folds one request of the main conversation into the counts. */
export const withStep = (stats: Stats, usage: Usage): Stats => ({
  ...stats,
  tokens: stats.tokens + usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
  model: usage.model || stats.model,
})

/** The most called tool, the first by name among equals; an MCP tool without its server. */
function topTool(tools: Record<string, number>): string | null {
  const [first] = Object.entries(tools).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))

  return first ? (mcp(first[0])?.name ?? first[0]) : null
}

/** `claude-opus-5-5[1m]` is `Opus 5.5`; a name already written out passes through. */
export function modelLabel(model: string): string {
  const id = model.replace(/\[.*\]$/, '').trim()
  if (!id.startsWith('claude-')) return id
  const parts = id.split('-').slice(1).filter(part => !/^\d{8}$/.test(part))
  const family = parts.find(part => /^[a-z]+$/i.test(part))
  const version = parts.filter(part => /^\d+$/.test(part)).join('.')

  return family ? `${family[0]?.toUpperCase()}${family.slice(1)}${version ? ` ${version}` : ''}` : id
}

/** Freezes the counts into what the card shows; `cost` is what the session has cost by now. */
export function recapOf(stats: Stats, now: { now: number; cwd: string; cost: number | null; isSoFar: boolean }): Recap {
  return {
    project: now.cwd.split(/[\\/]/).filter(Boolean).pop() ?? '',
    at: now.now,
    model: modelLabel(stats.model),
    workedMs: stats.workedMs,
    turns: stats.turns,
    toolCalls: Object.values(stats.tools).reduce((sum, calls) => sum + calls, 0),
    topTool: topTool(stats.tools),
    files: stats.files.length,
    added: stats.added,
    removed: stats.removed,
    testRuns: stats.testRuns,
    subagents: stats.subagents,
    skills: stats.skills.length,
    connectors: stats.connectors.length,
    tokens: stats.tokens,
    cost: now.cost === null || stats.costAtStart === null ? null : Math.max(0, now.cost - stats.costAtStart),
    isSoFar: now.isSoFar,
  }
}

/** `1h 42m`, `14m`, `45s`. */
export function span(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return `${Math.max(0, Math.round(ms / 1000))}s`
  if (minutes < 60) return `${minutes}m`

  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
}

const UNITS: [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

/** `864`, `1,077`, `12.4K`, `2.1M`. */
export function count(value: number): string {
  if (value < 10_000) return String(Math.round(value)).replace(/\B(?=(\d{3})+$)/g, ',')
  const [size, unit] = UNITS.find(([floor]) => value >= floor) ?? [1, '']
  const scaled = value / size

  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, '')}${unit}`
}

/** `$6.40`, and `$142` from a hundred dollars. */
export const dollars = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `5 Jan 2026`, in the machine's own time. */
export function dateLabel(ms: number): string {
  const date = new Date(ms)

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** What each tile of the card says. No tile shows a zero: one with nothing to say gives its place to the next. */
export function tilesOf(recap: Recap): Tiles {
  const hasCalls = recap.toolCalls > 0
  const hasCost = recap.cost !== null && recap.cost >= 0.005
  const tokens = recap.tokens > 0 ? count(recap.tokens) : null
  // Tokens stand on the accent tile when no tool was called, so nowhere else then.
  const spareTokens = hasCalls ? tokens : null
  const turns = `${count(recap.turns)} turn${recap.turns === 1 ? '' : 's'}`

  const candidates: (Tile | false | null)[] = [
    recap.files > 0 && { label: 'Files edited', value: count(recap.files) },
    recap.added + recap.removed > 0 && { label: 'Lines', value: `+${count(recap.added)}`, removed: `−${count(recap.removed)}` },
    recap.topTool !== null && { label: 'Most used', value: recap.topTool },
    recap.testRuns > 0 && { label: 'Test runs', value: count(recap.testRuns) },
    hasCost && { label: 'Cost', value: dollars(recap.cost ?? 0), ...(spareTokens ? { note: `${spareTokens} tokens` } : {}) },
    recap.subagents > 0 && { label: 'Subagents', value: count(recap.subagents) },
    recap.skills > 0 && { label: 'Skills', value: count(recap.skills) },
    recap.connectors > 0 && { label: 'Connectors', value: count(recap.connectors) },
    !hasCost && spareTokens !== null && { label: 'Tokens', value: spareTokens },
  ]

  return {
    headline: { project: recap.project, date: `${recap.isSoFar ? 'So far · ' : ''}${dateLabel(recap.at)}`, time: span(recap.workedMs), note: recap.model ? `${turns} on ${recap.model}` : turns },
    accent: hasCalls ? { label: 'Tool calls', value: count(recap.toolCalls) } : { label: 'Tokens', value: tokens ?? '0' },
    small: candidates.filter((tile): tile is Tile => Boolean(tile)).slice(0, SMALL_TILES),
  }
}

/** The card in a sentence or two, for someone who cannot see it. */
export function altOf(recap: Recap): string {
  const { headline, accent, small } = tilesOf(recap)
  const said = [accent, ...small].map(tile => `${tile.label}: ${tile.value}${tile.removed ? ` ${tile.removed}` : ''}${tile.note ? `, ${tile.note}` : ''}.`)

  return `Session recap of ${headline.project}, ${headline.date}: ${headline.time} worked, ${headline.note}. ${said.join(' ')}`
}
