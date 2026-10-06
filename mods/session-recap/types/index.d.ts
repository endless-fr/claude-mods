/** The mod's values in `$.state`: the session's, kept through a reload of the mod. */

/** The counts of one conversation, from the session's start or the last /clear. */
export type Stats = {
  /** Dollars the session had cost when the conversation began; null where nothing keeps count. */
  costAtStart: number | null
  /** The time Claude spent working, summed over the main conversation's turns. */
  workedMs: number
  turns: number
  /** Calls by tool name, the main conversation's and its subagents'. */
  tools: Record<string, number>
  /** The paths edited, each once. They never leave this value: the card shows how many. */
  files: string[]
  added: number
  removed: number
  testRuns: number
  subagents: number
  skills: string[]
  connectors: string[]
  tokens: number
  /** The model that answered the main conversation's last request, by the id the API reports. */
  model: string
}

/** A conversation as the card shows it: figures only, and the project's folder name. */
export type Recap = {
  project: string
  /** When it was frozen, in the clock's milliseconds. */
  at: number
  model: string
  workedMs: number
  turns: number
  toolCalls: number
  topTool: string | null
  files: number
  added: number
  removed: number
  testRuns: number
  subagents: number
  skills: number
  connectors: number
  tokens: number
  /** Dollars this conversation cost; null where nothing keeps count. */
  cost: number | null
  /** True for a conversation still running, shown by /recap before any /clear. */
  isSoFar: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-recap': {
      /** The running conversation's counts; null until the session's start gave it a cost to count from. */
      stats: Stats | null
      /** What the pane shows: the last conversation cleared, or the running one when /recap asked for it. */
      card: Recap | null
      /** What the last press of Copy image or Save image came to; empty before any. */
      outcome: string
    }
  }
}
