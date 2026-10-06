import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On, SessionRateLimit, SessionUsage, TurnUsage } from 'claude-code'

export const PLUGIN = 'context-weather'
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
// Monday 5 January 2026, 12:00 UTC.
export const NOON = Date.UTC(2026, 0, 5, 12)

type Setup = {
  store?: Record<string, unknown>
  env?: Record<string, string>
  settings?: Record<string, unknown>
  /** What a mod placed after this one draws in the band. */
  beneath?: string
}

/**
 * Stands for the engine beneath the mod: a clock, a store and an environment
 * in memory, and the figures a session would report, which a test changes
 * through the object this returns.
 */
export function world(on: On, setup: Setup = {}) {
  const clock = mock.clock(on, { now: NOON })
  // The mod's store, kept where a test can read what the mod wrote.
  const store = new Map<string, unknown>(Object.entries(setup.store ?? {}))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => ({ value: void store.set(e.key, JSON.parse(JSON.stringify(e.value))) }))
  on('store.delete', (_, e) => ({ value: void store.delete(e.key) }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  mock.env(on, setup.env ?? {})

  const state = {
    id: 'session-1',
    usage: { startedAt: NOON, context: { window: 1_000_000 }, rateLimits: [] } as SessionUsage,
    agents: [] as AgentInfo[],
    step: null as TurnUsage | null,
  }

  on('session.id', () => ({ value: state.id }))
  on('session.usage', () => ({ value: state.usage }))
  on('agent.list', () => ({ value: state.agents }))
  on('settings.read', () => ({ value: setup.settings ?? {} }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return Box({ children: setup.beneath ? [Text({ children: setup.beneath })] : [] })
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: state.step }
  })

  return {
    clock,
    state,
    store,
    context(tokens: number, window = 1_000_000) {
      state.usage = { ...state.usage, context: { tokens, window, percent: Math.round((tokens / window) * 100) } }
    },
    limits(...rateLimits: SessionRateLimit[]) {
      state.usage = { ...state.usage, rateLimits }
    },
    cost(usd: number) {
      state.usage = { ...state.usage, cost: { usd } }
    },
  }
}

/** A /clear: the conversation ends and the process goes on under a new session id. */
export async function clear($: Engine, w: ReturnType<typeof world>) {
  await $.session.end({ reason: 'clear', sessionId: w.state.id, resume: { id: w.state.id } })
  w.state.id = `${w.state.id}+`
  w.state.usage = { ...w.state.usage, context: { window: w.state.usage.context.window } }
}

export const start = ($: Engine) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

let turns = 0

/** One main-loop turn ends, the session's figures being what the world now says. */
export const turn = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: `turn-${++turns}`, reason: 'answer', ...(agentId ? { agentId } : {}) })

/** One main-loop model request, answered with the token counts given. */
export async function request($: Engine, w: ReturnType<typeof world>, usage: Partial<TurnUsage>, agentId?: string) {
  w.state.step = { model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage }
  const stream = $.turn.step({ turnId: `turn-${turns}`, index: 0, model: w.state.step.model, messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // Nothing to read: the mod is what is under test.
  }
  await stream.result
}

const props = (bodyColumns: number, maxRows: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows,
  bodyColumns,
  scroll: { offset: 0, bodyRows: maxRows },
  view: {},
})

export const band = ($: Engine, surface: 'terminal' | 'desktop', columns = 200, rows = 4) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(columns, rows) })

/** Everything the band shows as text, in reading order. */
export async function shown($: Engine, surface: 'terminal' | 'desktop', columns = 200) {
  const ui = await band($, surface, columns)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return texts.map(text => text.text).join(' ').replace(/\s+/g, ' ').trim()
}

/** The desktop band's drawing that reads `alt` to someone who cannot see it. */
export async function drawing($: Engine, alt: string | RegExp) {
  const ui = await band($, 'desktop')
  const drawings = await ui.findAll({ type: 'Svg' })
  await ui.unmount()

  return drawings.find(one => (typeof alt === 'string' ? one.props.alt === alt : alt.test(String(one.props.alt))))
}

/** The colour the terminal gives the text `text`, absent when it is left plain. */
export async function colorOf($: Engine, text: string | RegExp) {
  const ui = await band($, 'terminal')
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()
  if (!found) throw new Error(`the band shows no "${text}"`)

  return found.props.color
}

/** The terminal line exactly as drawn, character for character. */
export async function line($: Engine, columns: number, rows = 4) {
  const ui = await band($, 'terminal', columns, rows)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return texts.map(text => text.text).join('')
}
