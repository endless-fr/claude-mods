import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangedFile } from '../types'
import { altOf, headerSvg } from './card'
import { badgeOf, barSvg, iconSvg, keyOf, relativeTo, split } from './designs'
import { diffOf } from './diff'

const PANE = 'changed-files'
const TITLE = 'Fichiers modifiés'
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

const files = atom({ plugin: 'changed-files', key: 'files' } as const, [] as ChangedFile[])
const originals = atom({ plugin: 'changed-files', key: 'originals' } as const, {} as Record<string, string | null>)
const selected = atom({ plugin: 'changed-files', key: 'selected' } as const, null as string | null)
const cursor = atom({ plugin: 'changed-files', key: 'cursor' } as const, null as string | null)
const docks = atom({ plugin: 'changed-files', key: 'docks' } as const, null as boolean | null)

function targetOf(e: { tool: string }): string | undefined {
  const input = e as Record<string, unknown>
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

/** The file's text, or null when there is none to read. */
async function textOf($: EngineInterface, path: string): Promise<string | null> {
  try {
    const text = await $.fs.read(path)
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE })

/**
 * Whether the pane may open on its own: where it lands as a sidebar. The app
 * docks it; the terminal only in its fullscreen layout, which /changed-files
 * reports. On the terminal's main screen it would sit above the prompt, so
 * there it waits for /changed-files.
 */
async function mayOpenUnasked($: EngineInterface): Promise<boolean> {
  const surfaces = await $.session.surfaces().catch(() => [] as const)
  if (surfaces.some(surface => surface !== 'terminal')) return true
  return (await read($, docks)) === true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changed-files',
      description: 'Afficher les fichiers modifiés depuis votre dernier message',
    })
    if ((await read($, files)).length > 0 && (await mayOpenUnasked($))) void open($)

    return next(e)
  })

  on('command.run', { command: 'changed-files' }, async ($, e) => {
    await update($, docks, () => e.presentation.isFullscreen)
    // Asked for: it takes the keyboard, so the digits unfold a diff at once.
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })

    return opened.isPlaced ? {} : { text: `Le panneau est ouvert mais pas encore affiché : ${opened.reason}` }
  })

  // A new message from the person starts a new list; a slash command does not.
  on('prompt.submit', async ($, e, next) => {
    if (!e.text.trimStart().startsWith('/')) {
      await update($, files, () => [])
      await update($, originals, () => ({}))
      await update($, selected, () => null)
      await update($, cursor, () => null)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!WRITE_TOOLS.includes(e.tool)) return next(e)
    const path = targetOf(e)
    if (path === undefined) return next(e)

    // The text before this turn first touched the file, kept once.
    const kept = await read($, originals)
    const before = path in kept ? (kept[path] ?? null) : await textOf($, path)
    if (!(path in kept)) await update($, originals, all => (path in all ? all : { ...all, [path]: before }))

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const after = (await textOf($, path)) ?? ''
    const { source, added, removed } = diffOf(before, after)
    const wasEmpty = (await read($, files)).length === 0
    await update($, files, list => {
      const rest = list.filter(one => one.path !== path)
      // Edited back to how it was: nothing to show for it.
      if (added === 0 && removed === 0) return rest
      return [...rest, { path, isNew: before === null, added, removed, diff: source }]
    })
    if (wasEmpty && (await mayOpenUnasked($))) void open($).catch(() => undefined)

    return ran
  })

  // A click on a file's row, from its Client: the row's key names the file.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const data = e.data as { toggle?: boolean } | null
    if (!data?.toggle) return {}
    const file = (await read($, files)).find(one => keyOf(one.path) === e.element)
    if (file) await update($, selected, now => (now === file.path ? null : file.path))

    return {}
  })

  // The terminal's ❯ follows the focus ring, as in Claude Code's own lists.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) await update($, cursor, () => e.element ?? null)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Code } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    const Client = 'Client' in table ? table.Client : undefined
    const list = [...(await read($, files))].reverse()
    const shown = await read($, selected)
    const toggle = (path: string) => () => void update($, selected, now => (now === path ? null : path))

    const rows = list.map(file => {
      const { name, dir } = split(file.path)
      const isOpen = shown === file.path
      const badge = badgeOf(file.isNew)

      // The desktop: a dark tile of its own, as the card's, lit under the pointer.
      if (Svg && Client) {
        return (
          <Box
            key={`tile-${keyOf(file.path)}`}
            flexDirection="column"
            gap={1}
            paddingX={2}
            paddingY={1}
            borderStyle="round"
            borderColor={isOpen ? '#0A84FF' : '#2C2C2E'}
            backgroundColor="#1C1C1E"
            hover={{ backgroundColor: '#242426', borderColor: isOpen ? '#0A84FF' : '#3A3A3C' }}
          >
            <Box flexDirection="row" alignItems="center" gap={2}>
              <Text bold color={badge.color}>
                {badge.letter}
              </Text>
              <Svg source={iconSvg(name)} alt="" width={36} height={36} />
              <Client
                key={keyOf(file.path)}
                module="./row.tsx"
                props={{ name, dir, isOpen }}
                flexGrow={1}
              />
              <Svg source={barSvg(file.added, file.removed)} alt="" width={53} height={9} />
            </Box>
            {isOpen ? <Code source={file.diff} format="diff" path={file.path} /> : null}
          </Box>
        )
      }

      return null
    })

    if (Svg) {
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={headerSvg(list)} alt={altOf(list)} />
          {rows}
        </Box>
      )
    }

    // The terminal: Claude Code's own list, a ❯ on the focused row, each row
    // a file's letter and path, its diff unfolded beneath it.
    const cwd = await $.session.cwd().catch(() => '')
    const at = await read($, cursor)
    const added = list.reduce((sum, file) => sum + file.added, 0)
    const removed = list.reduce((sum, file) => sum + file.removed, 0)

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold>Fichiers modifiés</Text>
          <Text dimColor>Aucune modification depuis votre dernier message.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Text bold>Fichiers modifiés</Text>
          <Text dimColor>·</Text>
          <Text dimColor>{list.length === 1 ? '1 fichier' : `${list.length} fichiers`}</Text>
          <Text color="green">{`+${added}`}</Text>
          <Text color="red">{`-${removed}`}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {list.map((file, index) => {
            const key = keyOf(file.path)
            const isOpen = shown === file.path
            const isAt = at === key
            const badge = badgeOf(file.isNew)
            return (
              <Box key={`row-${key}`} flexDirection="column">
                <Box gap={1}>
                  <Text color="#0A84FF">{isAt ? '❯' : ' '}</Text>
                  <Text bold color={badge.color}>
                    {badge.letter}
                  </Text>
                  <Button key={key} plain autoFocus={index === 0 ? true : undefined} onPress={toggle(file.path)}>
                    {relativeTo(cwd, file.path)}
                  </Button>
                  <Text dimColor>{`+${file.added} -${file.removed}`}</Text>
                </Box>
                {isOpen ? (
                  <Box paddingLeft={4} marginBottom={1}>
                    <Code source={file.diff} format="diff" path={file.path} />
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑/↓ pour choisir · Entrée pour la diff · Échap pour revenir au prompt</Text>
        </Box>
      </Box>
    )
  })
}
