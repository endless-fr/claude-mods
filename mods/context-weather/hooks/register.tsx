import type { EngineInterface, Register, RenderElement, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import { desktopBand } from './desktop'
import { STARTS_KEPT, cleared, emptyThread, restored, savedOf, segments, sortLimits, withCost, withReading, withRequest } from './measure'
import type { Limit, Reading, Thread } from './measure'
import { terminalBand } from './terminal'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// The mod's store, shared by every session on the machine.
// The account's limits: the newest reading any session made.
const LIMITS_KEY = 'limits'
// What the last fresh threads held after their first turn: what "heavy" is measured against.
const STARTS_KEY = 'starts'
// One entry per session, so its bars and its cache countdown come back with it.
const THREAD_PREFIX = 'thread:'
const THREADS_KEPT_FOR = 7 * DAY

// Subagents start and finish between turns, where no event of ours fires.
const AGENTS_EVERY = 15_000

let thread = emptyThread()
// When `thread.limits` was read, by whichever session read it.
let limitsAt = 0
let ticker: Timer | null = null
let agentsTicker: Timer | null = null

const readingOf = (context: SessionContextUsage): Reading | null =>
  context.tokens === undefined
    ? null
    : { tokens: context.tokens, window: context.window, percent: context.percent ?? Math.round((context.tokens / context.window) * 100) }

/** Keeps this session's reading of the limits and offers it to the others. */
async function publishLimits($: EngineInterface, limits: readonly SessionRateLimit[]) {
  if (limits.length === 0) return
  limitsAt = await $.clock.now()
  thread = { ...thread, limits: sortLimits(limits) }
  await $.store.set(LIMITS_KEY, { at: limitsAt, list: thread.limits })
}

/** Takes another session's reading of the limits when it is newer than ours. */
async function adoptLimits($: EngineInterface) {
  const saved = (await $.store.get(LIMITS_KEY)) as { at?: number; list?: Limit[] } | undefined
  if (saved && typeof saved.at === 'number' && Array.isArray(saved.list) && saved.at > limitsAt) {
    limitsAt = saved.at
    thread = { ...thread, limits: sortLimits(saved.list) }
  }
}

/** Reads the subagents running now; true when the list changed. */
async function refreshAgents($: EngineInterface): Promise<boolean> {
  const running = (await $.agent.list()).filter(agent => agent.status === 'running')
  const ids = (agents: readonly { id: string }[]) => agents.map(agent => agent.id).join()
  if (ids(running) === ids(thread.agents)) return false
  thread = { ...thread, agents: running.map(({ id, type, description }) => ({ id, type, description })) }

  return true
}

/** A new thread's first turn says what a fresh thread holds here. */
async function noteStart($: EngineInterface) {
  const held = thread.context?.tokens ?? 0
  if (!thread.isFresh || held <= 0) return
  thread = { ...thread, isFresh: false, starts: [...thread.starts, held].slice(-STARTS_KEPT) }
  await $.store.set(STARTS_KEY, thread.starts)
}

/** Saves what this session's thread should come back with. */
async function saveThread($: EngineInterface) {
  await $.store.set(THREAD_PREFIX + (await $.session.id()), { at: await $.clock.now(), ...savedOf(thread) })
}

/** Brings this session's thread back, and forgets the sessions nobody returned to. */
async function restoreThread($: EngineInterface) {
  const mine = THREAD_PREFIX + (await $.session.id())
  const oldest = (await $.clock.now()) - THREADS_KEPT_FOR
  for (const key of await $.store.keys()) {
    if (!key.startsWith(THREAD_PREFIX)) continue
    const saved = (await $.store.get(key)) as { at?: number } | undefined
    if (key === mine) thread = restored(thread, saved)
    else if (!(typeof saved?.at === 'number' && saved.at >= oldest)) await $.store.delete(key)
  }
}

const numbers = (value: unknown): number[] => (Array.isArray(value) ? value.filter(one => typeof one === 'number' && one > 0) : [])

const isOn = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value?.trim() ?? '')
const ttlIn = (value: unknown) => (value === '5m' || value === '1h' ? value : null)

/**
 * What the person's environment and settings say of the main conversation's
 * cache, in the order Claude Code itself takes them.
 */
async function cacheRuleOf($: EngineInterface): Promise<Thread['cacheRule']> {
  if (isOn(await $.env.get('DISABLE_PROMPT_CACHING'))) return 'off'
  if (isOn(await $.env.get('FORCE_PROMPT_CACHING_5M'))) return '5m'
  const settings: Record<string, unknown> = await $.settings.read()

  return (
    ttlIn(await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')) ??
    ttlIn(settings.promptCacheTtl) ??
    (isOn(await $.env.get('ENABLE_PROMPT_CACHING_1H')) ? '1h' : null)
  )
}

/** True for a tree that shows nothing: no text, and no drawing of its own. */
function isBlank(node: unknown): boolean {
  if (node === null || node === undefined || node === false) return true
  if (typeof node === 'string') return node.trim() === ''
  if (Array.isArray(node)) return node.every(isBlank)
  if (typeof node !== 'object') return false
  const element = node as { type?: string; children?: unknown }

  return (element.type === 'Box' || element.type === 'Text') && isBlank(element.children)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    const cost = usage.cost?.usd ?? null
    thread = { ...emptyThread(), cacheRule: await cacheRuleOf($), starts: numbers(await $.store.get(STARTS_KEY)), cost, costAtTurn: cost }
    await restoreThread($)
    thread = withReading(thread, readingOf(usage.context), true)
    // Nothing in the window yet: this thread is new, and its first turn will say what a start weighs.
    thread = { ...thread, isFresh: thread.context === null || thread.context.tokens <= 0 }
    await refreshAgents($)
    limitsAt = 0
    // A session that just started has at best an old reading of its own: what
    // the last session to measure left in the store comes first.
    await adoptLimits($)
    if (limitsAt === 0) await publishLimits($, usage.rateLimits)

    // Time moves the gauges and the cache countdown on, and another session
    // may have a newer reading of the limits.
    ticker?.cancel()
    ticker = $.clock.every(MINUTE, async () => {
      await adoptLimits($)
      $.ui.invalidate('ui.render')
    })
    agentsTicker?.cancel()
    agentsTicker = $.clock.every(AGENTS_EVERY, async () => {
      if (await refreshAgents($)) $.ui.invalidate('ui.render')
    })
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') {
      // The process goes on with a new thread, and no session.start says so.
      thread = cleared(thread)
      $.ui.invalidate('ui.render')
    } else {
      ticker?.cancel()
      agentsTicker?.cancel()
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    thread = withCost(withReading(thread, readingOf(e.context), false), e.cost?.usd, false)
    if (e.changed.includes('rateLimits')) await publishLimits($, e.rateLimits)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  // Each request of the main conversation: a subagent's has a cache of its own.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage) {
      thread = withRequest(thread, await $.clock.now(), result.usage)
      // The request may have handed work to a subagent.
      await refreshAgents($)
      await saveThread($)
      $.ui.invalidate('ui.render')
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const usage = await $.session.usage()
      thread = withCost(withReading(thread, readingOf(usage.context), true), usage.cost?.usd, true)
      await noteStart($)
      await saveThread($)
      $.ui.invalidate('ui.render')
    } else if (await refreshAgents($)) {
      // A subagent's turn ended: it may have been its last.
      $.ui.invalidate('ui.render')
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = e.props.hasSurvey ? [] : segments(thread, await $.clock.now())
    let band: RenderElement
    if (shown.length > 0 && e.surface === 'desktop') band = desktopBand($.ui.resolve(e), shown)
    else if (shown.length > 0 && e.surface === 'terminal') band = terminalBand($.ui.resolve(e), shown, e.props.bodyColumns, e.props.maxRows)
    else return next(e)

    // A mod placed after this one keeps its place in the band, under our line.
    const beneath = await next(e)
    if (isBlank(beneath)) return band
    const { Box } = $.ui.resolve(e)

    return <Box flexDirection="column">{[band, beneath]}</Box>
  })
}
