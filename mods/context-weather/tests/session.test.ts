import { expect, test } from 'claude-code/testing'

import { colorOf, drawing, shown, start, turn, world } from './world'

const agent = (id: string, status = 'running') => ({ id, type: 'Explore', description: `Task ${id}`, status })

test('shows what the session has cost', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.cost(18.42)
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await shown($, surface)).toContain('$18.42')
  }
})

test('drops the cents from a hundred dollars', async ($, on) => {
  const w = world(on)
  w.cost(142.3)
  await start($)

  expect(await shown($, 'terminal')).toBe('$142')
})

test('says nothing of a session that has cost nothing', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.cost(0)
  await start($)

  expect(await shown($, 'terminal')).not.toContain('$')
})

test('shows what the last turn added to the cost', async ($, on) => {
  const w = world(on)
  w.cost(16.11)
  await start($)
  w.cost(18.42)
  await turn($)

  expect(await shown($, 'terminal')).toContain('$18.42 +$2.31')
})

test('follows the cost as the session measures it', async ($, on) => {
  const w = world(on)
  w.cost(1)
  await start($)
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 1.5 }, changed: ['cost'] })

  expect(await shown($, 'terminal')).toContain('$1.50')
})

test('stays quiet about a thread under 300k tokens', async ($, on) => {
  const w = world(on)
  w.context(299_000)
  await start($)

  expect(await shown($, 'terminal')).not.toContain('heavy')
})

test('warns of a heavy thread from 300k tokens, against what its first turn held', async ($, on) => {
  const w = world(on)
  await start($)
  w.context(60_000)
  await turn($)
  w.context(336_000)
  await turn($)

  expect(await shown($, 'terminal')).toContain('heavy thread ×5.6')
  expect(await colorOf($, '×5.6')).toBe('yellow')
})

test('turns the heavy thread red from 600k tokens', async ($, on) => {
  const w = world(on)
  await start($)
  w.context(50_000)
  await turn($)
  w.context(650_000)
  await turn($)

  expect(await colorOf($, '×13')).toBe('red')
})

test('does not measure a resumed thread against where it was picked up', async ($, on) => {
  const w = world(on)
  w.context(200_000)
  await start($)
  await turn($)
  w.context(320_000)
  await turn($)

  expect(await shown($, 'terminal')).toEndWith('heavy thread')
})

test('measures a heavy thread against the lightest start of the last fresh threads', async ($, on) => {
  const w = world(on, { store: { starts: [80_000, 40_000, 120_000] } })
  w.context(400_000)
  await start($)

  expect(await shown($, 'terminal')).toContain('heavy thread ×10')
})

test('gives a heavy thread no ratio when no start is known', async ($, on) => {
  const w = world(on)
  w.context(400_000)
  await start($)

  expect(await shown($, 'terminal')).toEndWith('heavy thread')
})

test('remembers where a fresh thread started', async ($, on) => {
  const w = world(on, { store: { starts: [80_000] } })
  await start($)
  w.context(45_000)
  await turn($)
  w.context(70_000)
  await turn($)

  expect(w.store.get('starts')).toEqual([80_000, 45_000])
})

test('does not take a resumed thread for a fresh one', async ($, on) => {
  const w = world(on, { store: { starts: [80_000] } })
  w.context(400_000)
  await start($)
  await turn($)

  expect(w.store.get('starts')).toEqual([80_000])
})

test('explains the heavy thread in the desktop tooltip', async ($, on) => {
  const w = world(on, { store: { starts: [50_000] } })
  w.context(400_000)
  await start($)

  const weight = await drawing($, /^Heavy thread/)

  expect(weight?.props.isInteractive).toBe(true)
  expect(String(weight?.props.source)).toContain('400k tokens of context, 8 times a fresh thread (50k)')
})

test('counts the subagents running', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.state.agents = [agent('a'), agent('b'), agent('c', 'completed')]
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await shown($, surface)).toContain('2 agents')
  }
})

test('says agent in the singular', async ($, on) => {
  const w = world(on)
  w.state.agents = [agent('a')]
  await start($)

  expect(await shown($, 'terminal')).toBe('1 agent')
})

test('shows no agents block when none runs', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.state.agents = [agent('a', 'completed')]
  await start($)

  expect(await shown($, 'terminal')).not.toContain('agent')
})

test('notices a subagent that finished', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  w.state.agents = [agent('a')]
  await start($)
  w.state.agents = [agent('a', 'completed')]
  await turn($, 'a')

  expect(await shown($, 'terminal')).not.toContain('agent')
})

test('notices a subagent that started between turns', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  await start($)
  w.state.agents = [agent('a')]
  await w.clock.advance(15_000)

  expect(await shown($, 'terminal')).toContain('1 agent')
})

test('lists what each subagent does in the desktop tooltip', async ($, on) => {
  const w = world(on)
  w.state.agents = [agent('a'), agent('b')]
  await start($)

  const robot = await drawing($, '2 agents running')

  expect(String(robot?.props.source)).toContain('<title>Explore · Task a\nExplore · Task b</title>')
})
