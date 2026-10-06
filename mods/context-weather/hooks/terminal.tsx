import type { Elements, RenderElement } from 'claude-code'

import type { ContextSegment, LimitSegment, Segment, Tone } from './measure'

// A disc that fills with the window: no terminal draws these as colour emoji.
const FILL = { clear: '○', cloudy: '◔', rain: '◑', storm: '◕', full: '●' } as const
const LEVELS = '▁▂▃▄▅▆▇█'
const COLOR: Record<Tone, string | undefined> = { calm: undefined, warn: 'yellow', alert: 'red' }

const PADDING = 1
const BORDER = 1
// The capsule's line between its top and bottom edges.
const CAPSULE_ROWS = 3
// From everything to the figures alone: what a narrowing terminal still shows.
const DETAILS = ['full', 'compact', 'figures'] as const
type Detail = (typeof DETAILS)[number]

/** One stretch of the line in one style: a value is plain, what surrounds it faint. */
type Run = { text: string; tone?: Tone; isFaint?: boolean }

const GAUGE_CELLS = 8

// A calm tone is no tone: the text keeps the terminal's own colour.
const toned = (tone: Tone) => (tone === 'calm' ? {} : { tone })

/** Solid up to the share used, a mark where the clock stands. */
function gauge(segment: LimitSegment): Run[] {
  const used = Math.round((segment.used / 100) * GAUGE_CELLS)
  const mark = segment.elapsed === null ? -1 : Math.min(GAUGE_CELLS - 1, Math.floor((segment.elapsed / 100) * GAUGE_CELLS))

  return Array.from({ length: GAUGE_CELLS }, (_, i): Run => {
    if (i === mark) return { text: '┃' }
    if (i < used) return { text: '━', ...toned(segment.tone) }

    return { text: '─', isFaint: true }
  })
}

function limitRuns(segment: LimitSegment, detail: Detail): Run[] {
  const runs: Run[] = [{ text: `${segment.label} `, isFaint: true }, { text: segment.percent, ...toned(segment.tone) }]
  if (detail === 'full') runs.push({ text: ' ' }, ...gauge(segment))
  if (segment.left && detail !== 'figures') runs.push({ text: ` ${segment.left}`, isFaint: true })

  return runs
}

function contextRuns(segment: ContextSegment, detail: Detail): Run[] {
  const runs: Run[] = [{ text: FILL[segment.sky], ...toned(segment.tone) }, { text: ` ${segment.tokens}` }]
  if (detail === 'figures') return runs
  runs.push({ text: ` ${segment.share}`, isFaint: true })
  if (detail !== 'full') return runs
  if (segment.bars.length > 0) {
    runs.push({ text: ` ${segment.bars.slice(0, -1).map(level).join('')}`, isFaint: true }, { text: level(segment.bars.at(-1) ?? 0), ...toned(segment.tone) })
  }
  if (segment.delta) runs.push({ text: ` ${segment.delta}`, isFaint: true })

  return runs
}

/** A segment at a level of detail; nothing when that level leaves it out. */
function runsOf(segment: Segment, detail: Detail): Run[] {
  const hasMore = detail === 'full'
  switch (segment.kind) {
    case 'context':
      return contextRuns(segment, detail)
    case 'limit':
      return limitRuns(segment, detail)
    case 'cache':
      // Down to the figures, a cache that is fine goes unsaid.
      if (detail === 'figures' && segment.tone === 'calm') return []

      return [{ text: 'cache ', isFaint: true }, { text: segment.value, ...toned(segment.tone) }, ...(hasMore && segment.detail ? [{ text: ` ${segment.detail}`, isFaint: true }] : [])]
    case 'cost':
      if (detail === 'figures') return []

      return [{ text: segment.value }, ...(hasMore && segment.detail ? [{ text: ` ${segment.detail}`, isFaint: true }] : [])]
    case 'heavy':
      return segment.ratio
        ? [{ text: 'heavy thread ', isFaint: true }, { text: segment.ratio, tone: segment.tone }]
        : [{ text: 'heavy thread', tone: segment.tone }]
    case 'agents':
      if (detail === 'figures') return []

      return [{ text: segment.count }, { text: ` ${segment.noun}`, isFaint: true }]
  }
}

const RULE: Run = { text: ' · ', isFaint: true }

function lineOf(segments: Segment[], detail: Detail): Run[] {
  return segments
    .map(segment => runsOf(segment, detail))
    .filter(runs => runs.length > 0)
    .flatMap((runs, i) => (i > 0 ? [RULE, ...runs] : runs))
}

const widthOf = (runs: Run[]) => runs.reduce((sum, run) => sum + run.text.length, 0)

// Only the styles a run asks for: a prop left out stays out of the drawing.
const style = (run: Run) => ({
  ...(run.isFaint ? { dimColor: true } : {}),
  ...(run.tone && COLOR[run.tone] ? { color: COLOR[run.tone] } : {}),
})

/** Neighbours in one style drawn as one Text. */
function merged(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    const last = out.at(-1)
    if (last && last.tone === run.tone && !last.isFaint === !run.isFaint) last.text += run.text
    else out.push({ ...run })
  }

  return out
}

const level = (share: number) => LEVELS[Math.round(share * (LEVELS.length - 1))] ?? LEVELS[0]!

/**
 * The band in a terminal: one dim capsule around one line, at the richest
 * level of detail that fits `columns`. Where the band has fewer rows than the
 * capsule takes, the line alone.
 */
export function terminalBand({ Box, Text }: Elements['terminal'], segments: Segment[], columns: number, rows: number): RenderElement {
  const hasBorder = rows >= CAPSULE_ROWS
  const room = columns - 2 * (PADDING + (hasBorder ? BORDER : 0))
  const runs = DETAILS.map(detail => lineOf(segments, detail)).find((line, i) => widthOf(line) <= room || i === DETAILS.length - 1) ?? []
  const line = merged(runs).map(run => <Text {...style(run)}>{run.text}</Text>)
  if (!hasBorder) return <Box paddingX={PADDING}>{line}</Box>

  return (
    <Box borderStyle="round" borderDimColor alignSelf="flex-start" paddingX={PADDING}>
      {line}
    </Box>
  )
}
