export type ChangedFile = {
  path: string
  /** Created since your last message. */
  isNew: boolean
  /** Removed since your last message, by a shell command. */
  isDeleted: boolean
  added: number
  removed: number
  diff: string
}

declare module 'claude-code' {
  interface PluginState {
    'changed-files': {
      files: ChangedFile[]
      /** Each file's text before this turn first changed it; null for a file that did not exist. */
      originals: Record<string, string | null>
      /** The file whose diff is unfolded. */
      selected: string | null
      /** Whether the terminal docks panes beside the transcript (fullscreen), as /changed-files last saw it. */
      docks: boolean | null
      /** The key of the terminal row the pane's focus ring is on. */
      cursor: string | null
      /** Whether /changed-files already said that Claude Code's diff panel covers this one. */
      hinted: boolean
    }
  }
}
