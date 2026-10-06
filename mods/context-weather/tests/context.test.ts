import { expect, test } from 'claude-code/testing'

import { drawing, shown, start, turn, world } from './world'

const SURFACES = ['terminal', 'desktop'] as const

test('draws nothing before the session has a reading', async ($, on) => {
  world(on)
  await start($)

  for (const surface of SURFACES) {
    expect(await shown($, surface)).toBe('')
  }
})

test('shows how many tokens the context holds', async ($, on) => {
  const w = world(on)
  w.context(312_000)
  await start($)

  for (const surface of SURFACES) {
    expect(await shown($, surface)).toContain('312k')
  }
})

test('shows what the last turn added to the context', async ($, on) => {
  const w = world(on)
  w.context(284_600)
  await start($)
  await turn($)
  w.context(312_000)
  await turn($)

  for (const surface of SURFACES) {
    expect(await shown($, surface)).toContain('+27.4k')
  }
})

test('shows a compaction as a drop', async ($, on) => {
  const w = world(on)
  w.context(640_000)
  await start($)
  await turn($)
  w.context(90_000)
  await turn($)

  expect(await shown($, 'terminal')).toContain('−550k')
})

test('yields the band to a survey', async ($, on) => {
  const w = world(on)
  w.context(312_000)
  await start($)

  const ui = await $.ui.mount({
    plugin: 'context-weather',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: true, isWorking: false, maxRows: 4, bodyColumns: 200, scroll: { offset: 0, bodyRows: 4 }, view: {} },
  })

  expect(await ui.find({ text: '312k' })).toBeUndefined()
})

test('names the weather in the terminal by how full the window is', async ($, on) => {
  const w = world(on)
  await start($)

  for (const [percent, glyph] of [[10, '☀'], [40, '☁'], [65, '☂'], [80, 'ϟ'], [95, '▲']] as const) {
    w.context(percent * 10_000)
    await turn($)
    expect(await shown($, 'terminal')).toStartWith(glyph)
  }
})

test('says the weather and the share of the window in the desktop glyph', async ($, on) => {
  const w = world(on)
  w.context(400_000)
  await start($)

  const glyph = await drawing($, 'Cloudy · 40% of 1M')

  expect(glyph?.props.isInteractive).toBe(true)
  expect(String(glyph?.props.source)).toContain('<title>Cloudy · 40% of 1M</title>')
})
