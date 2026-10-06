export type ChangedFile = { path: string; isNew: boolean; added: number; removed: number; diff: string }

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
    }
  }
}
