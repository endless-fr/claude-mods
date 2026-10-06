import { expect, test } from 'claude-code/testing'

import { DAY, HOUR, MINUTE, NOON, colorOf, drawing, shown, start, world } from './world'

const SURFACES = ['terminal', 'desktop'] as const
const at = (ms: number) => new Date(ms).toISOString()
const fiveHour = (percentUsed: number, left: number) => ({ kind: 'five_hour', percentUsed, resetsAt: at(NOON + left) })
const sevenDay = (percentUsed: number, left: number) => ({ kind: 'seven_day', percentUsed, resetsAt: at(NOON + left) })

test('shows each limit with its share used and the time to its reset', async ($, on) => {
  const w = world(on)
  w.limits(sevenDay(52, 3 * DAY + 2 * HOUR), fiveHour(48, 2 * HOUR + 54 * MINUTE))
  await start($)

  for (const surface of SURFACES) {
    expect(await shown($, surface)).toMatch(/5h .*48% .*2h 54m .*7d .*52% .*3d 2h/)
  }
})

test('leaves a limit plain while usage keeps behind the clock', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(40, 2.5 * HOUR))
  await start($)

  expect(await colorOf($, '40%')).toBeUndefined()
})

test('turns a limit yellow when usage runs ahead of the clock', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(60, 2.5 * HOUR))
  await start($)

  expect(await colorOf($, '60%')).toBe('yellow')
})

test('turns a limit red when usage runs far ahead of the clock', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(75, 2.5 * HOUR))
  await start($)

  expect(await colorOf($, '75%')).toBe('red')
})

test('turns a limit red when it is nearly spent, whatever the clock says', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(92, 10 * MINUTE))
  await start($)

  expect(await colorOf($, '92%')).toBe('red')
})

test('hides a window that has already reset', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.limits(fiveHour(80, -MINUTE), sevenDay(30, 4 * DAY))
  await start($)

  const text = await shown($, 'terminal')

  expect(text).not.toContain('5h')
  expect(text).toContain('7d')
})

test('counts the time down as the clock moves', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(48, 2 * HOUR + 54 * MINUTE))
  await start($)
  await w.clock.advance(30 * MINUTE)

  expect(await shown($, 'terminal')).toContain('2h 24m')
})

test('follows a limit as the session measures it', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(10, 4 * HOUR))
  await start($)
  const rateLimits = [fiveHour(11, 4 * HOUR)]
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits, changed: ['rateLimits'] })

  expect(await shown($, 'terminal')).toContain('11%')
})

test('draws the desktop gauge with the share used and the share of time elapsed', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(48, 3 * HOUR))
  await start($)

  expect(await drawing($, '5h limit: 48% used, 40% of the window elapsed')).toBeDefined()
})

test('says when the 5-hour limit resets in the desktop clock', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(48, 3 * HOUR))
  await start($)

  const clock = await drawing($, /^Resets at \d\d:\d\d$/)

  expect(clock?.props.isInteractive).toBe(true)
})

test('takes a newer reading another session made while this one runs', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(20, 2 * HOUR))
  await start($)
  w.store.set('limits', { at: NOON + MINUTE, list: [fiveHour(63, 2 * HOUR)] })
  await w.clock.advance(2 * MINUTE)

  expect(await shown($, 'terminal')).toContain('63%')
})

test('starts from the reading the last session left', async ($, on) => {
  world(on, { store: { limits: { at: NOON - 10 * MINUTE, list: [fiveHour(63, 2 * HOUR)] } } })
  await start($)

  expect(await shown($, 'terminal')).toContain('63%')
})

test('publishes its own reading for the other sessions', async ($, on) => {
  const w = world(on)
  w.limits(fiveHour(20, 2 * HOUR))
  await start($)

  expect(w.store.get('limits')).toMatchObject({ at: NOON, list: [{ kind: 'five_hour', percentUsed: 20 }] })
})
