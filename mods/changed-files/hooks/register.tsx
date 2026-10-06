import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangedFile } from '../types'
import { altOf, headerSvg } from './card'
import { badgeOf, barSvg, iconSvg, keyOf, split } from './designs'
import { diffOf } from './diff'

const PANE = 'changed-files'
const TITLE = 'Fichiers modifiés'
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

const files = atom({ plugin: 'changed-files', key: 'files' } as const, [] as ChangedFile[])
const originals = atom({ plugin: 'changed-files', key: 'originals' } as const, {} as Record<string, string | null>)
const selected = atom({ plugin: 'changed-files', key: 'selected' } as const, null as string | null)

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changed-files',
      description: 'Afficher les fichiers modifiés depuis votre dernier message',
    })
    if ((await read($, files)).length > 0) void open($)

    return next(e)
  })

  on('command.run', { command: 'changed-files' }, async $ => {
    const opened = await open($)

    return opened.isPlaced ? {} : { text: `Le panneau est ouvert mais pas encore affiché : ${opened.reason}` }
  })

  // A new message from the person starts a new list; a slash command does not.
  on('prompt.submit', async ($, e, next) => {
    if (!e.text.trimStart().startsWith('/')) {
      await update($, files, () => [])
      await update($, originals, () => ({}))
      await update($, selected, () => null)
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
    if (wasEmpty) void open($).catch(() => undefined)

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

      return (
        <Box flexDirection="column" borderStyle="round" borderColor={isOpen ? '#0A84FF' : undefined} borderDimColor={!isOpen} paddingX={1}>
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text bold color={badge.color}>
              {badge.letter}
            </Text>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text bold wrap="truncate-end">
                {name}
              </Text>
              <Text dimColor wrap="truncate-start">
                {dir}
              </Text>
            </Box>
            <Button key={keyOf(file.path)} variant={isOpen ? 'primary' : 'secondary'} onPress={toggle(file.path)}>
              {isOpen ? 'Masquer' : 'Diff'}
            </Button>
          </Box>
          {isOpen ? <Code source={file.diff} format="diff" path={file.path} /> : null}
        </Box>
      )
    })

    if (Svg) {
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={headerSvg(list)} alt={altOf(list)} />
          {rows}
        </Box>
      )
    }

    const added = list.reduce((sum, file) => sum + file.added, 0)
    const removed = list.reduce((sum, file) => sum + file.removed, 0)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text bold>Fichiers modifiés</Text>
          {list.length === 0 ? (
            <Text dimColor>Aucune modification. Les fichiers modifiés par Claude apparaîtront ici.</Text>
          ) : (
            <Box gap={1}>
              <Text dimColor>{altOf(list)}</Text>
              <Text color="#30D158">{`+${added}`}</Text>
              <Text color="#FF453A">{`−${removed}`}</Text>
            </Box>
          )}
        </Box>
        {rows}
      </Box>
    )
  })
}
