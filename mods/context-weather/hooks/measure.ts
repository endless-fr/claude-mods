// What the band says, worked out from the session's figures: no drawing and no
// engine calls here, so every rule can be read (and tested) on its own.

export type Tone = 'calm' | 'warn' | 'alert'
export type Sky = 'clear' | 'cloudy' | 'rain' | 'storm' | 'full'

export type Reading = { tokens: number; window: number; percent: number }
/** One of the account's usage windows, as the session reports it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Ttl = '5m' | '1h'
export type MissCause = 'model changed' | 'expired' | 'prefix changed'
/** The token counts of one request, as the API reports them. */
export type RequestUsage = { model: string; input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
/** The main conversation's last request: when it was answered and what the cache served of it. */
export type Request = { at: number; model: string; read: number; written: number; plain: number; miss?: MissCause }

/** A subagent at work. */
export type Agent = { id: string; type: string; description: string }

/** Everything the band draws from. */
export type Thread = {
  /** The context window as last reported. */
  context: Reading | null
  /** Context tokens after each completed turn, oldest first. */
  turns: number[]
  /** The account's usage windows, newest reading known on this machine. */
  limits: Limit[]
  request: Request | null
  /** What the person's settings say of the cache: off, a lifetime, or nothing. */
  cacheRule: 'off' | Ttl | null
  /** The lifetime the traffic showed, which settles it. */
  seenTtl: Ttl | null
  /** Dollars the session has cost, as /cost totals them; null where nothing keeps count. */
  cost: number | null
  /** What the cost stood at when the last turn ended, and what that turn added. */
  costAtTurn: number | null
  lastTurnCost: number | null
  /** What the last fresh threads on this machine held after their first turn. */
  starts: number[]
  /** True until a new thread's first turn has been measured. */
  isFresh: boolean
  agents: Agent[]
}

export type ContextSegment = {
  kind: 'context'
  sky: Sky
  tone: Tone
  tokens: string
  /** Share of the window held, as `21%`. */
  share: string
  /** What each recent turn added, 0 to 1 against the largest of them. */
  bars: number[]
  delta: string
  tip: string
}

export type LimitSegment = {
  kind: 'limit'
  id: string
  label: string
  /** Share of the window used, 0 to 100. */
  used: number
  /** Share of the window's time gone, 0 to 100; null when its length is unknown. */
  elapsed: number | null
  tone: Tone
  percent: string
  /** Time to the reset, empty when unknown. */
  left: string
  /** What the gauge says in words. */
  alt: string
  /** When the window resets, empty when not worth a tooltip. */
  tip: string
}

export type CacheSegment = { kind: 'cache'; tone: Tone; value: string; detail: string }

export type CostSegment = { kind: 'cost'; value: string; detail: string }
/** `ratio` is empty when nothing says what a fresh thread holds. */
export type HeavySegment = { kind: 'heavy'; tone: Tone; ratio: string; tip: string }
export type AgentsSegment = { kind: 'agents'; count: string; noun: string; alt: string; tip: string }

export type Segment = ContextSegment | LimitSegment | CacheSegment | CostSegment | HeavySegment | AgentsSegment

export const TURNS_KEPT = 12
const BARS_SHOWN = 6

const SKIES: readonly { below: number; sky: Sky; name: string; tone: Tone }[] = [
  { below: 30, sky: 'clear', name: 'Clear', tone: 'calm' },
  { below: 55, sky: 'cloudy', name: 'Cloudy', tone: 'calm' },
  { below: 75, sky: 'rain', name: 'Rain', tone: 'calm' },
  { below: 90, sky: 'storm', name: 'Storm', tone: 'warn' },
  { below: Infinity, sky: 'full', name: 'Compact soon', tone: 'alert' },
]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The windows whose length is known, in the order they are drawn.
const WINDOWS: Record<string, { label: string; span: number }> = {
  five_hour: { label: '5h', span: 5 * HOUR },
  seven_day: { label: '7d', span: 7 * DAY },
}
const WINDOW_ORDER = Object.keys(WINDOWS)

// Pace is the share used less the share of time gone, in points.
const AHEAD_WARN = 5
const AHEAD_ALERT = 20
const NEARLY_SPENT = 90

const TTL: Record<Ttl, number> = { '5m': 5 * MINUTE, '1h': HOUR }
// The countdown turns yellow in the last fifth of the cache's life.
const LAPSING = 0.2
// A request that wrote this much, and more than it read, wrote the prompt again.
const REWRITE_FLOOR = 2_000
// An expired cache on a context this large is worth a number.
const WORTH_SAYING = 100_000

// Every request reads the whole context again, so a long thread pays for its
// length at each step: worth a word from here, and a red one from there.
const HEAVY = 300_000
const VERY_HEAVY = 600_000
export const STARTS_KEPT = 5

export const emptyThread = (): Thread => ({
  context: null,
  turns: [],
  limits: [],
  request: null,
  cacheRule: null,
  seenTtl: null,
  cost: null,
  costAtTurn: null,
  lastTurnCost: null,
  starts: [],
  isFresh: false,
  agents: [],
})

/** What a session keeps between two runs of the same thread. */
export type Saved = Pick<Thread, 'turns' | 'request' | 'seenTtl' | 'lastTurnCost'>

export const savedOf = ({ turns, request, seenTtl, lastTurnCost }: Thread): Saved => ({ turns, request, seenTtl, lastTurnCost })

/** Lays what a session saved over a thread, taking only what still has the right shape. */
export function restored(thread: Thread, saved: unknown): Thread {
  if (typeof saved !== 'object' || saved === null) return thread
  const { turns, request, seenTtl, lastTurnCost } = saved as Partial<Saved>

  return {
    ...thread,
    turns: Array.isArray(turns) ? turns.filter(one => typeof one === 'number' && one > 0).slice(-TURNS_KEPT) : thread.turns,
    request: request && typeof request.at === 'number' && typeof request.read === 'number' ? request : thread.request,
    seenTtl: seenTtl === '5m' || seenTtl === '1h' ? seenTtl : thread.seenTtl,
    lastTurnCost: typeof lastTurnCost === 'number' ? lastTurnCost : thread.lastTurnCost,
  }
}

/** The thread a /clear leaves: what belongs to the account and the machine stays. */
export function cleared(thread: Thread): Thread {
  const { limits, cacheRule, cost, starts, agents } = thread

  return { ...emptyThread(), limits, cacheRule, cost, costAtTurn: cost, starts, agents, isFresh: true }
}

/** Records the session's cost; at a turn's end, what that turn added to it. */
export function withCost(thread: Thread, cost: number | undefined, isTurnEnd: boolean): Thread {
  if (cost === undefined) return thread
  if (!isTurnEnd) return { ...thread, cost }
  const added = thread.costAtTurn === null ? null : cost - thread.costAtTurn

  return { ...thread, cost, costAtTurn: cost, lastTurnCost: added !== null && added >= 0 ? added : null }
}

const dollars = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

function costSegment(thread: Thread): CostSegment | null {
  if (thread.cost === null || thread.cost < 0.005) return null
  const added = thread.lastTurnCost ?? 0

  return { kind: 'cost', value: dollars(thread.cost), detail: added >= 0.005 ? `+${dollars(added)}` : '' }
}

function heavySegment(thread: Thread): HeavySegment | null {
  const size = thread.context?.tokens ?? 0
  if (size < HEAVY) return null
  // A fresh thread's load: the lightest of the recent starts, this thread's own among them if it began here.
  const start = thread.starts.length > 0 ? Math.min(...thread.starts) : null
  const times = start === null ? null : size / start
  const ratio = times === null ? '' : times >= 10 ? String(Math.round(times)) : trim(times)
  const versus = start === null ? '' : `, ${ratio} times a fresh thread (${tokens(start)})`

  return {
    kind: 'heavy',
    tone: size >= VERY_HEAVY ? 'alert' : 'warn',
    ratio: ratio && `×${ratio}`,
    tip: `Heavy thread: ${tokens(size)} tokens of context${versus}. Every request reads all of it again, so a new thread costs less.`,
  }
}

function agentsSegment(thread: Thread): AgentsSegment | null {
  const count = thread.agents.length
  if (count === 0) return null
  const noun = count === 1 ? 'agent' : 'agents'

  return {
    kind: 'agents',
    count: String(count),
    noun,
    alt: `${count} ${noun} running`,
    tip: thread.agents.map(agent => `${agent.type} · ${agent.description}`).join('\n'),
  }
}

/** <1m, 41m, 1h, 2h 54m, 3d 2h. */
export function duration(ms: number): string {
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const [big, small] = minutes < 24 * 60 ? [`${Math.floor(minutes / 60)}h`, `${minutes % 60}m`] : [`${Math.floor(minutes / (24 * 60))}d`, `${Math.floor((minutes % (24 * 60)) / 60)}h`]

  return small.startsWith('0') ? big : `${big} ${small}`
}

/** 20:34, in the machine's time zone. */
function clockTime(ms: number): string {
  const date = new Date(ms)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** The windows in drawing order, each kind once. */
export function sortLimits(limits: readonly Limit[]): Limit[] {
  const rank = (kind: string) => (WINDOW_ORDER.includes(kind) ? WINDOW_ORDER.indexOf(kind) : WINDOW_ORDER.length)

  return [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))
}

/** 950, 27.4k, 312k, 1.2M: one decimal only where it still says something. */
export function tokens(count: number): string {
  if (count >= 1_000_000) return `${trim(count / 1_000_000)}M`
  if (count >= 100_000) return `${Math.round(count / 1_000)}k`
  if (count >= 1_000) return `${trim(count / 1_000)}k`

  return String(Math.round(count))
}

const trim = (value: number) => String(Number(value.toFixed(1)))

/** Records the window's fill; a repeat of the last turn's reading adds no turn. */
export function withReading(thread: Thread, reading: Reading | null, isTurnEnd: boolean): Thread {
  if (reading === null) return thread
  const isNew = reading.tokens > 0 && thread.turns.at(-1) !== reading.tokens
  const turns = isTurnEnd && isNew ? [...thread.turns, reading.tokens].slice(-TURNS_KEPT) : thread.turns

  return { ...thread, context: reading, turns }
}

function contextSegment(thread: Thread): ContextSegment | null {
  const reading = thread.context
  if (reading === null || reading.tokens <= 0) return null
  const { sky, name, tone } = SKIES.find(one => reading.percent < one.below) ?? SKIES[SKIES.length - 1]!
  const steps = thread.turns.slice(-(BARS_SHOWN + 1))
  const added = steps.slice(1).map((after, i) => after - steps[i]!)
  const largest = Math.max(1, ...added)
  const last = added.at(-1) ?? 0

  return {
    kind: 'context',
    sky,
    tone,
    tokens: tokens(reading.tokens),
    share: `${reading.percent}%`,
    bars: added.map(one => Math.max(0, one) / largest),
    delta: last > 0 ? `+${tokens(last)}` : last < 0 ? `−${tokens(-last)}` : '',
    tip: `${name} · ${reading.percent}% of ${tokens(reading.window)}`,
  }
}

/**
 * How long the main conversation's cache lives. Claude Code asks for an hour
 * on a subscription within its plan's usage and five minutes otherwise, unless
 * the person chose; what the traffic showed beats both.
 */
function ttlOf(thread: Thread): number {
  if (thread.seenTtl) return TTL[thread.seenTtl]
  if (thread.cacheRule === '5m' || thread.cacheRule === '1h') return TTL[thread.cacheRule]
  const plan = thread.limits.filter(limit => limit.kind in WINDOWS)

  return plan.length > 0 && plan.every(limit => limit.percentUsed < 100) ? TTL['1h'] : TTL['5m']
}

const promptOf = (request: Request) => request.read + request.written + request.plain

/** Records a main-loop request: whether the cache served it, and what that says of the lifetime. */
export function withRequest(thread: Thread, at: number, usage: RequestUsage): Thread {
  const request: Request = { at, model: usage.model, read: usage.cache_read_input_tokens, written: usage.cache_creation_input_tokens, plain: usage.input_tokens }
  const last = thread.request
  if (last === null) return { ...thread, request }

  const gap = at - last.at
  // A prompt cut by half or more is a compaction or a new thread, which rewrite by design.
  const isSamePrompt = promptOf(request) >= promptOf(last) / 2
  const isRewrite = isSamePrompt && request.written >= REWRITE_FLOOR && request.written > request.read
  let seenTtl = thread.seenTtl
  if (!isRewrite && request.read > 0 && gap > TTL['5m']) seenTtl = '1h'
  if (isRewrite && request.model === last.model && gap > TTL['5m'] && gap < TTL['1h']) seenTtl = '5m'
  const next = { ...thread, seenTtl }
  if (isRewrite) request.miss = request.model !== last.model ? 'model changed' : gap >= ttlOf(next) ? 'expired' : 'prefix changed'

  return { ...next, request }
}

function cacheSegment(thread: Thread, now: number): CacheSegment | null {
  const request = thread.request
  if (request === null || thread.cacheRule === 'off') return null
  const ttl = ttlOf(thread)
  const left = request.at + ttl - now
  if (left <= 0) {
    const size = thread.context?.tokens ?? promptOf(request)

    return { kind: 'cache', tone: 'alert', value: 'expired', detail: size >= WORTH_SAYING ? `${tokens(size)} to rewrite` : '' }
  }
  const isLapsing = left < ttl * LAPSING

  return { kind: 'cache', tone: isLapsing || request.miss ? 'warn' : 'calm', value: duration(left), detail: request.miss ? `missed: ${request.miss}` : '' }
}

function limitSegment(limit: Limit, now: number): LimitSegment | null {
  const resets = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)
  // Past its reset, the reading describes a window that no longer exists.
  if (resets <= now) return null
  const window = WINDOWS[limit.kind]
  const label = window?.label ?? limit.kind.replaceAll('_', ' ')
  const used = Math.max(0, limit.percentUsed)
  const left = Number.isFinite(resets) ? resets - now : null
  const elapsed = window && left !== null ? Math.min(100, Math.max(0, ((window.span - left) / window.span) * 100)) : null
  const ahead = elapsed === null ? 0 : used - elapsed
  const tone: Tone = used >= NEARLY_SPENT || ahead >= AHEAD_ALERT ? 'alert' : ahead > AHEAD_WARN ? 'warn' : 'calm'
  const percent = `${Math.round(used)}%`

  return {
    kind: 'limit',
    id: limit.kind,
    label,
    used,
    elapsed,
    tone,
    percent,
    left: left === null ? '' : duration(left),
    alt: `${label} limit: ${percent} used${elapsed === null ? '' : `, ${Math.round(elapsed)}% of the window elapsed`}`,
    tip: limit.kind === 'five_hour' && left !== null ? `Resets at ${clockTime(resets)}` : '',
  }
}

/** The band's segments at `now`, in the order they are drawn. */
export function segments(thread: Thread, now: number): Segment[] {
  return [
    contextSegment(thread),
    ...thread.limits.map(limit => limitSegment(limit, now)),
    cacheSegment(thread, now),
    costSegment(thread),
    heavySegment(thread),
    agentsSegment(thread),
  ].filter(one => one !== null)
}
