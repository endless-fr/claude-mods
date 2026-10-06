import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PaneOpenArgs, SessionUsage, TurnUsage } from 'claude-code'

export const PLUGIN = 'session-recap'
export const PANE = 'session-recap'
export const MINUTE = 60_000
// Monday 5 January 2026, 12:00 UTC: the 5th in every time zone a test runs in.
export const NOON = Date.UTC(2026, 0, 5, 12)

export type Surface = 'terminal' | 'desktop'

/**
 * Stands for the engine beneath the mod: a clock and an environment in
 * memory, the figures a session would report, and a record of what the mod
 * asked of the machine, which a test reads through the object this returns.
 */
export function world(on: On) {
  const clock = mock.clock(on, { now: NOON })
  mock.env(on, { HOME: '/Users/ada', TMPDIR: '/tmp/ada/' })

  const state = {
    id: 'session-1',
    cwd: '/Users/ada/dev/claude-mods',
    usage: { startedAt: NOON, context: { window: 1_000_000 }, rateLimits: [] } as SessionUsage,
    step: null as TurnUsage | null,
    /** True while the person refuses every tool call. */
    isDenying: false,
    /** The command that fails: `missing` when none can start, or the name of one that exits 1. */
    failing: null as string | null,
    /** What a typed /clear does while its command runs: a test sets it to end the conversation. */
    onClear: null as (() => Promise<void>) | null,
  }
  const opened: PaneOpenArgs[] = []
  const ran: string[][] = []
  const written = new Map<string, string>()

  on('session.id', () => ({ value: state.id }))
  on('session.cwd', () => ({ value: state.cwd }))
  on('session.usage', () => ({ value: state.usage }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })
  on('fs.write', (_, e) => ({ value: void written.set(e.path, e.text) }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (state.failing === 'missing') return { deny: `spawn ${e.argv[0]} ENOENT` }

    return { value: { exitCode: e.argv[0] === state.failing ? 1 : 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: state.step }
  })
  on('tool.call', () => (state.isDenying ? { deny: 'refused' } : { result: {}, text: '' }))
  on('command.run', async (_, e) => {
    if (e.command === 'clear') await state.onClear?.()

    return {}
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))

  const w = {
    clock,
    state,
    opened,
    ran,
    written,
    cost(usd: number) {
      state.usage = { ...state.usage, cost: { usd } }
    },
  }

  return w
}

export type World = ReturnType<typeof world>

export const start = ($: Engine) => $.session.start({ cwd: '/Users/ada/dev/claude-mods', surface: 'desktop', isInteractive: true })

/** A /clear: the conversation ends and the process goes on under a new session id. */
export async function clear($: Engine, w: World) {
  await $.session.end({ reason: 'clear', sessionId: w.state.id, resume: { id: w.state.id } })
  w.state.id = `${w.state.id}+`
}

/** A slash command typed at the prompt and run. */
export const command = ($: Engine, name: string) => $.command.run({ command: name, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

let turns = 0

/** One turn ends after `durationMs` of work: the main conversation's, or a subagent's. */
export const turn = ($: Engine, durationMs = MINUTE, agentId?: string) =>
  $.turn.complete({ answer: '', durationMs, isAborted: false, turnId: `turn-${++turns}`, reason: 'answer', ...(agentId ? { agentId } : {}) })

/** One model request of the main conversation, answered with the token counts given. */
export async function request($: Engine, w: World, usage: Partial<TurnUsage>, agentId?: string) {
  w.state.step = { model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage }
  const stream = $.turn.step({ turnId: `turn-${turns}`, index: 0, model: w.state.step.model, messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // Nothing to read: the mod is what is under test.
  }
  await stream.result
}

const PROPS = { title: 'Session Recap', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }

export const pane = <S extends Surface>($: Engine, surface: S) => $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: PROPS })

/** Everything the pane shows as text, in reading order. */
export async function shown($: Engine, surface: Surface) {
  const ui = await pane($, surface)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return texts.map(text => text.text).join(' | ')
}

/** The card the desktop pane draws: its markup and what it says to someone who cannot see it. */
export async function card($: Engine) {
  const ui = await pane($, 'desktop')
  const drawing = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return { source: String(drawing?.props.source ?? ''), alt: String(drawing?.props.alt ?? ''), props: Object.keys(drawing?.props ?? {}).sort() }
}
