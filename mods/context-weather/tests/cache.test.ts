import { expect, test } from 'claude-code/testing'

import { HOUR, MINUTE, NOON, colorOf, request, shown, start, world } from './world'

const at = (ms: number) => new Date(ms).toISOString()
// A Claude subscription within its plan's usage: the main conversation's cache lives an hour.
const PLAN = [
  { kind: 'five_hour', percentUsed: 10, resetsAt: at(NOON + 4 * HOUR) },
  { kind: 'seven_day', percentUsed: 10, resetsAt: at(NOON + 100 * HOUR) },
]
const HIT = { cache_read_input_tokens: 300_000, cache_creation_input_tokens: 2_000 }
const REWRITE = { cache_read_input_tokens: 0, cache_creation_input_tokens: 302_000 }

test('says nothing of the cache before the first request', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  await start($)

  expect(await shown($, 'terminal')).not.toContain('cache')
})

test("counts down the hour a subscription's cache lives", async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(19 * MINUTE)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await shown($, surface)).toContain('cache 41m')
  }
})

test('counts five minutes off a subscription', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(2 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache 3m')
})

test('counts five minutes once the plan is spent and usage credits pay', async ($, on) => {
  const w = world(on)
  w.limits({ ...PLAN[0]!, percentUsed: 100 }, PLAN[1]!)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(2 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache 3m')
})

test('starts the countdown again with each request', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(30 * MINUTE)
  await request($, w, HIT)
  await w.clock.advance(10 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache 50m')
})

test('leaves subagent requests out: they have a cache of their own', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  await start($)
  await request($, w, HIT, 'agent-1')

  expect(await shown($, 'terminal')).not.toContain('cache')
})

test('turns yellow when the cache is about to lapse', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(40 * MINUTE)

  expect(await colorOf($, /^20m$/)).toBeUndefined()

  await w.clock.advance(10 * MINUTE)

  expect(await colorOf($, /^10m$/)).toBe('yellow')
})

test('says expired in red once the cache has lapsed, with what the next message writes again', async ($, on) => {
  const w = world(on)
  w.context(640_000)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(61 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache expired 640k to rewrite')
  expect(await colorOf($, 'expired')).toBe('red')
})

test('keeps an expired cache short on a small context', async ($, on) => {
  const w = world(on)
  w.context(40_000)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(6 * MINUTE)

  expect(await shown($, 'terminal')).toEndWith('cache expired')
})

test('names a model switch as the cause of a rewrite', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(MINUTE)
  await request($, w, { ...REWRITE, model: 'claude-sonnet-5-5' })

  expect(await shown($, 'terminal')).toContain('cache 1h missed: model changed')
})

test('names a lapse as the cause of a rewrite', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(61 * MINUTE)
  await request($, w, REWRITE)

  expect(await shown($, 'terminal')).toContain('missed: expired')
})

test('names a changed prefix as the cause of a rewrite when nothing else explains it', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(MINUTE)
  await request($, w, REWRITE)

  expect(await shown($, 'terminal')).toContain('missed: prefix changed')
})

test('does not call a compaction a miss', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await request($, w, { cache_read_input_tokens: 0, cache_creation_input_tokens: 40_000 })

  expect(await shown($, 'terminal')).not.toContain('missed')
})

test('forgets a miss at the next request the cache serves', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await request($, w, REWRITE)
  await request($, w, HIT)

  expect(await shown($, 'terminal')).not.toContain('missed')
})

test('learns the hour from a request the cache served after more than five minutes', async ($, on) => {
  const w = world(on)
  w.context(120_000)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(10 * MINUTE)
  await request($, w, HIT)
  await w.clock.advance(20 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache 40m')
})

test('learns five minutes from a rewrite within the hour', async ($, on) => {
  const w = world(on)
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)
  await w.clock.advance(10 * MINUTE)
  await request($, w, REWRITE)
  await w.clock.advance(2 * MINUTE)

  expect(await shown($, 'terminal')).toContain('cache 3m missed: expired')
})

test('follows FORCE_PROMPT_CACHING_5M over everything else', async ($, on) => {
  const w = world(on, { env: { FORCE_PROMPT_CACHING_5M: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }, settings: { promptCacheTtl: '1h' } })
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)

  expect(await shown($, 'terminal')).toContain('cache 5m')
})

test('follows CLAUDE_CODE_PROMPT_CACHE_TTL over the setting', async ($, on) => {
  const w = world(on, { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }, settings: { promptCacheTtl: '5m' } })
  w.context(120_000)
  await start($)
  await request($, w, HIT)

  expect(await shown($, 'terminal')).toContain('cache 1h')
})

test('follows the promptCacheTtl setting over ENABLE_PROMPT_CACHING_1H', async ($, on) => {
  const w = world(on, { env: { ENABLE_PROMPT_CACHING_1H: '1' }, settings: { promptCacheTtl: '5m' } })
  w.limits(...PLAN)
  await start($)
  await request($, w, HIT)

  expect(await shown($, 'terminal')).toContain('cache 5m')
})

test('follows ENABLE_PROMPT_CACHING_1H off a subscription', async ($, on) => {
  const w = world(on, { env: { ENABLE_PROMPT_CACHING_1H: '1' } })
  w.context(120_000)
  await start($)
  await request($, w, HIT)

  expect(await shown($, 'terminal')).toContain('cache 1h')
})

test('says nothing of the cache when caching is off', async ($, on) => {
  const w = world(on, { env: { DISABLE_PROMPT_CACHING: '1' } })
  w.context(120_000)
  await start($)
  await request($, w, { input_tokens: 120_000 })

  expect(await shown($, 'terminal')).not.toContain('cache')
})
