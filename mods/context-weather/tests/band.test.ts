import { expect, test } from 'claude-code/testing'

import { DAY, HOUR, MINUTE, NOON, band, clear, line, request, shown, start, turn, world } from './world'

const at = (ms: number) => new Date(ms).toISOString()
const PLAN = [
  { kind: 'five_hour', percentUsed: 48, resetsAt: at(NOON + 2 * HOUR + 54 * MINUTE) },
  { kind: 'seven_day', percentUsed: 52, resetsAt: at(NOON + 3 * DAY + 2 * HOUR) },
]
const HIT = { cache_read_input_tokens: 300_000, cache_creation_input_tokens: 2_000 }

/** A session two turns in, with every block that needs no warning to show. */
async function busy($: Parameters<typeof start>[0], w: ReturnType<typeof world>) {
  w.context(184_600)
  w.limits(...PLAN)
  w.cost(16.11)
  await start($)
  await turn($)
  w.context(212_000)
  w.cost(18.42)
  await request($, w, HIT)
  await turn($)
}

test('draws the whole line where the terminal has room', async ($, on) => {
  const w = world(on)
  await busy($, w)

  expect(await line($, 200)).toBe('○ 212k 21% █ +27.4k · 5h 48% ━━━┃──── 2h 54m · 7d 52% ━━━━┃─── 3d 2h · cache 1h · $18.42 +$2.31')
})

test('drops the bars and the detail when the terminal is too narrow for them', async ($, on) => {
  const w = world(on)
  await busy($, w)

  expect(await line($, 80)).toBe('○ 212k 21% · 5h 48% 2h 54m · 7d 52% 3d 2h · cache 1h · $18.42')
})

test('keeps only the figures in a very narrow terminal', async ($, on) => {
  const w = world(on)
  await busy($, w)

  expect(await line($, 40)).toBe('○ 212k · 5h 48% · 7d 52%')
})

test('keeps a warning in a very narrow terminal', async ($, on) => {
  const w = world(on)
  await busy($, w)
  await w.clock.advance(61 * MINUTE)

  expect(await line($, 40)).toContain('cache expired')
})

test('never draws a capsule wider than the terminal that can hold the figures', async ($, on) => {
  const w = world(on)
  await busy($, w)

  for (let columns = 30; columns <= 110; columns++) {
    // The border and one cell of padding on each side of the line.
    expect((await line($, columns)).length).toBeLessThanOrEqual(columns - 4)
  }
})

test('draws the terminal band as one dim capsule no wider than its line', async ($, on) => {
  const w = world(on)
  await busy($, w)

  const ui = await band($, 'terminal')
  const capsules = (await ui.findAll({ type: 'Box' })).filter(one => one.props.borderStyle === 'round')

  expect(capsules).toHaveLength(1)
  expect(capsules[0]?.props).toMatchObject({ borderDimColor: true, alignSelf: 'flex-start' })
})

test('draws the bare line where the band has no room for a border', async ($, on) => {
  const w = world(on)
  await busy($, w)

  const ui = await band($, 'terminal', 200, 2)
  const boxes = await ui.findAll({ type: 'Box' })

  expect(boxes.filter(one => one.props.borderStyle)).toHaveLength(0)
  expect(await line($, 200, 2)).toStartWith('○ 212k 21%')
})

test('gives the bare line the two cells the border would have taken', async ($, on) => {
  const w = world(on)
  await busy($, w)

  expect(await line($, 97, 2)).toContain('━━━┃────')
  expect(await line($, 97)).not.toContain('━━━┃────')
})

test('tells values from labels by dimness alone, never by weight', async ($, on) => {
  const w = world(on)
  await busy($, w)

  const ui = await band($, 'terminal')
  const texts = await ui.findAll({ type: 'Text' })

  expect(texts.filter(one => one.props.bold)).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: '$18.42' }))?.props.dimColor).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: '+$2.31' }))?.props.dimColor).toBe(true)
})

test('draws the desktop band as one capsule, its blocks split by hairlines', async ($, on) => {
  const w = world(on)
  await busy($, w)

  const ui = await band($, 'desktop')
  const boxes = await ui.findAll({ type: 'Box' })
  const rules = (await ui.findAll({ type: 'Svg' })).filter(one => one.props.alt === '|')

  expect(boxes.filter(one => one.props.borderStyle === 'round')).toHaveLength(1)
  expect(boxes.map(one => one.key).filter(Boolean)).toEqual(['context', 'five_hour', 'seven_day', 'cache', 'cost'])
  expect(rules).toHaveLength(4)
})

test('keeps what a mod placed after it draws, beneath its own line', async ($, on) => {
  const w = world(on, { beneath: 'another mod' })
  w.context(212_000)
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await shown($, surface)).toMatch(/212k.*another mod$/)
  }
})

test('starts over after a /clear', async ($, on) => {
  const w = world(on)
  await busy($, w)
  await clear($, w)

  expect(await line($, 200)).toBe('5h 48% ━━━┃──── 2h 54m · 7d 52% ━━━━┃─── 3d 2h · $18.42')
})

test('takes the thread after a /clear for a fresh one', async ($, on) => {
  const w = world(on)
  await busy($, w)
  await clear($, w)
  w.context(38_000)
  await turn($)

  expect(w.store.get('starts')).toEqual([38_000])
})

test('brings a session back as it was left', async ($, on) => {
  const w = world(on)
  await busy($, w)
  await w.clock.advance(10 * MINUTE)
  await start($)

  expect(await shown($, 'terminal')).toContain('○ 212k 21% █ +27.4k')
  expect(await shown($, 'terminal')).toContain('cache 50m')
  expect(await shown($, 'terminal')).toContain('$18.42 +$2.31')
})

test('keeps one session apart from another', async ($, on) => {
  const w = world(on)
  await busy($, w)
  w.state.id = 'session-2'
  await start($)

  expect(await shown($, 'terminal')).not.toContain('+27.4k')
  expect(await shown($, 'terminal')).not.toContain('cache')
})

test('forgets sessions left idle for more than a week', async ($, on) => {
  const w = world(on, {
    store: {
      'thread:old': { at: NOON - 8 * DAY, turns: [1] },
      'thread:recent': { at: NOON - 6 * DAY, turns: [1] },
    },
  })
  await start($)

  expect([...w.store.keys()]).toEqual(['thread:recent'])
})
