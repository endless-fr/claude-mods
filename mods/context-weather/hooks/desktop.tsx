import type { Elements, RenderElement } from 'claude-code'

import type { AgentsSegment, CacheSegment, ContextSegment, HeavySegment, LimitSegment, Segment, Sky, Tone } from './measure'

// One neutral grey that reads on a light and on a dark page; colour is kept
// for what needs attention.
const GREY = '#8E8E93'
const INK: Record<Tone, string> = { calm: GREY, warn: '#E08600', alert: '#E5484D' }
const EDGE = 'rgba(142,142,147,0.30)'
const FILL = 'rgba(142,142,147,0.08)'
const FAINT = 'rgba(142,142,147,0.45)'

const ICON = 15
const SPARK = { height: 12, bar: 3, gap: 2 }
const GAUGE = { width: 40, height: 9, bar: 3 }
const TRACK = 'rgba(142,142,147,0.28)'

// An Svg that answers the pointer is drawn in a frame of its own, which a
// browser paints white under a dark page unless the frame names both schemes.
const FRAME = '<style>:root{color-scheme:light dark}</style>'

const escape = (text: string) => text.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c)

const stroke = (ink: string, d: string) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`

const CLOUD = 'M7.5 16.5h9a3.5 3.5 0 0 0 .5-6.96 5.5 5.5 0 0 0-10.6 1.1A3 3 0 0 0 7.5 16.5z'
const SKIES: Record<Sky, (ink: string) => string> = {
  clear: ink => `<circle cx="12" cy="12" r="3.6" fill="none" stroke="${ink}" stroke-width="1.7"/>${stroke(ink, 'M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6')}`,
  cloudy: ink => stroke(ink, CLOUD),
  rain: ink => `<g transform="translate(0 -2.5)">${stroke(ink, CLOUD)}</g>${stroke(ink, 'M9 17.5l-1 3M12.5 17.5l-1 3M16 17.5l-1 3')}`,
  storm: ink => `<g transform="translate(0 -2.5)">${stroke(ink, CLOUD)}</g>${stroke(ink, 'M12.5 15.5l-2 3h3l-2 3')}`,
  full: ink => stroke(ink, 'M12 4.5 3.5 19.5h17zM12 10.5v4M12 17.2v.1'),
}

/** A small drawing with a tooltip: `tip` shows while the pointer rests on it. */
function glyph(body: string, tip: string, width = ICON): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ICON}" viewBox="0 0 ${(width * 24) / ICON} 24">${FRAME}<title>${escape(tip)}</title>${body}</svg>`
}

/** One bar per recent turn, as tall as what it added; the latest in ink. */
function spark(bars: number[], ink: string): { source: string; width: number } {
  const { height, bar, gap } = SPARK
  const width = bars.length * bar + (bars.length - 1) * gap
  const rects = bars.map((share, i) => {
    const tall = Math.max(1.5, share * height)

    return `<rect x="${i * (bar + gap)}" y="${(height - tall).toFixed(1)}" width="${bar}" height="${tall.toFixed(1)}" rx="1" fill="${i === bars.length - 1 ? ink : FAINT}"/>`
  })

  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join('')}</svg>`, width }
}

const CLOCK = (ink: string) => `<circle cx="12" cy="12" r="8" fill="none" stroke="${ink}" stroke-width="1.7"/>${stroke(ink, 'M12 7.5V12l3 2')}`

/** A thin bar for the share used and a taller tick where the clock stands. */
function gauge(segment: LimitSegment): string {
  const { width, height, bar } = GAUGE
  const top = (height - bar) / 2
  const used = (Math.min(100, segment.used) / 100) * width
  const tick = segment.elapsed === null ? '' : `<rect x="${Math.min(width - 1.5, (segment.elapsed / 100) * width).toFixed(1)}" width="1.5" height="${height}" rx="0.75" fill="${GREY}"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect y="${top}" width="${width}" height="${bar}" rx="${bar / 2}" fill="${TRACK}"/>` +
    `<rect y="${top}" width="${used.toFixed(1)}" height="${bar}" rx="${bar / 2}" fill="${INK[segment.tone]}"/>${tick}</svg>`
  )
}

function drawLimit({ Svg, Text }: Elements['desktop'], segment: LimitSegment): RenderElement[] {
  const parts = [
    <Text dimColor>{segment.label}</Text>,
    <Svg source={gauge(segment)} alt={segment.alt} width={GAUGE.width} height={GAUGE.height} />,
    <Text bold {...inked(segment.tone)}>
      {segment.percent}
    </Text>,
  ]
  if (segment.tip) parts.push(<Svg source={glyph(CLOCK(GREY), segment.tip)} alt={segment.tip} width={ICON} height={ICON} isInteractive />)
  if (segment.left) parts.push(<Text dimColor>{segment.left}</Text>)

  return parts
}

/** Colour only where the tone asks for attention. */
const inked = (tone: Tone) => (tone === 'calm' ? {} : { color: INK[tone] })

function drawCache({ Text }: Elements['desktop'], segment: CacheSegment): RenderElement[] {
  return [
    <Text dimColor>cache</Text>,
    <Text bold {...inked(segment.tone)}>
      {segment.value}
    </Text>,
    ...(segment.detail ? [<Text dimColor>{segment.detail}</Text>] : []),
  ]
}

// A weight: a handle over a body.
const WEIGHT = (ink: string) => stroke(ink, 'M9.2 8.5a2.8 2.8 0 1 1 5.6 0M7 8.5h10l2.2 10.5H4.8z')
// Work handed out: one node over two.
const BRANCH = (ink: string) =>
  `${stroke(ink, 'M12 8.5v3.5M12 12H7.5v3M12 12h4.5v3')}<circle cx="12" cy="6" r="2.4" fill="none" stroke="${ink}" stroke-width="1.7"/><circle cx="7.5" cy="17.5" r="2.4" fill="none" stroke="${ink}" stroke-width="1.7"/><circle cx="16.5" cy="17.5" r="2.4" fill="none" stroke="${ink}" stroke-width="1.7"/>`

function drawHeavy({ Svg, Text }: Elements['desktop'], segment: HeavySegment): RenderElement[] {
  const icon = <Svg source={glyph(WEIGHT(INK[segment.tone]), segment.tip)} alt={segment.tip} width={ICON} height={ICON} isInteractive />

  return segment.ratio
    ? [icon, <Text dimColor>heavy</Text>, <Text bold color={INK[segment.tone]}>{segment.ratio}</Text>]
    : [icon, <Text bold color={INK[segment.tone]}>heavy</Text>]
}

function drawAgents({ Svg, Text }: Elements['desktop'], segment: AgentsSegment): RenderElement[] {
  return [
    <Svg source={glyph(BRANCH(GREY), segment.tip)} alt={segment.alt} width={ICON} height={ICON} isInteractive />,
    <Text bold>{segment.count}</Text>,
    <Text dimColor>{segment.noun}</Text>,
  ]
}

function draw(table: Elements['desktop'], segment: Segment): RenderElement[] {
  if (segment.kind === 'limit') return drawLimit(table, segment)
  if (segment.kind === 'cache') return drawCache(table, segment)
  if (segment.kind === 'heavy') return drawHeavy(table, segment)
  if (segment.kind === 'agents') return drawAgents(table, segment)
  if (segment.kind === 'cost') {
    return [<table.Text bold>{segment.value}</table.Text>, ...(segment.detail ? [<table.Text dimColor>{segment.detail}</table.Text>] : [])]
  }

  return drawContext(table, segment)
}

function drawContext({ Svg, Text }: Elements['desktop'], segment: ContextSegment): RenderElement[] {
  const ink = INK[segment.tone]
  const parts = [
    <Svg source={glyph(SKIES[segment.sky](ink), segment.tip)} alt={segment.tip} width={ICON} height={ICON} isInteractive />,
    <Text bold>{segment.tokens}</Text>,
  ]
  if (segment.bars.length > 0) {
    const { source, width } = spark(segment.bars, ink)
    parts.push(<Svg source={source} alt={`Tokens added by the last ${segment.bars.length} turns`} width={width} height={SPARK.height} />)
  }
  if (segment.delta) parts.push(<Text dimColor>{segment.delta}</Text>)

  return parts
}

// A hairline between two blocks; its alt is what a reader hears there.
const RULE = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="14" viewBox="0 0 1 14"><rect width="1" height="14" fill="${EDGE}"/></svg>`

const keyOf = (segment: Segment) => (segment.kind === 'limit' ? segment.id : segment.kind)

/** The band in the desktop app: one quiet capsule, the blocks split by hairlines. */
export function desktopBand(table: Elements['desktop'], segments: Segment[]): RenderElement {
  const { Box, Svg } = table

  return (
    <Box flexDirection="row" paddingX={1}>
      <Box flexDirection="row" alignItems="center" columnGap={1} paddingX={1} paddingY={0} borderStyle="round" borderColor={EDGE} backgroundColor={FILL}>
        {segments.flatMap((segment, i) => [
          ...(i > 0 ? [<Svg source={RULE} alt="|" width={1} height={14} />] : []),
          <Box key={keyOf(segment)} flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
            {draw(table, segment)}
          </Box>,
        ])}
      </Box>
    </Box>
  )
}
