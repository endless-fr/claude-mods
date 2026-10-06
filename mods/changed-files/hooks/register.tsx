import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { ChangedFile } from '../types'
import { altOf, headerSvg } from './card'
import { dirtyIn, removalsOf } from './shell'
import { badgeOf, barSvg, iconSvg, keyOf, relativeTo, split } from './designs'
import { diffOf } from './diff'

const PANE = 'changed-files'
const TITLE = 'Fichiers modifiés'
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

const files = atom({ plugin: 'changed-files', key: 'files' } as const, [] as ChangedFile[])
const originals = atom({ plugin: 'changed-files', key: 'originals' } as const, {} as Record<string, string | null>)
const selected = atom({ plugin: 'changed-files', key: 'selected' } as const, null as string | null)
const cursor = atom({ plugin: 'changed-files', key: 'cursor' } as const, null as string | null)
const hinted = atom({ plugin: 'changed-files', key: 'hinted' } as const, false as boolean)
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

/** Git's answer, or null outside a repository or on any failure. */
async function git($: EngineInterface, args: string[], cwd: string): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', ...args], { cwd })
    return ran.exitCode === 0 ? ran.stdout : null
  } catch {
    return null
  }
}

/** A file's size and time, to tell it changed; null when it is not there. */
async function stampOf($: EngineInterface, path: string): Promise<string | null> {
  try {
    const stat = await $.fs.stat(path)
    return stat.kind === 'file' ? `${stat.size}:${stat.mtimeMs}` : null
  } catch {
    return null
  }
}

// Past this many files git lists as changed, the shell's are followed only among those the mod knows.
const MOST_DIRTY = 300

/** A file before and after: null before for one that did not exist, null after for one deleted. */
type Change = { path: string; before: string | null; after: string | null }

/**
 * Puts each change in the list: its first text kept for the reply, its diff
 * against that text, its letter. A file back as it was, or made and deleted
 * in the same reply, leaves it. Opens the pane on the reply's first file.
 */
async function record($: EngineInterface, changes: Change[]) {
  if (changes.length === 0) return
  const wasEmpty = (await read($, files)).length === 0
  for (const { path, before, after } of changes) {
    await update($, originals, all => (path in all ? all : { ...all, [path]: before }))
    const first = (await read($, originals))[path] ?? null
    const { source, added, removed } = diffOf(first, after ?? '')
    await update($, files, list => {
      const rest = list.filter(one => one.path !== path)
      if (after === null) {
        return first === null ? rest : [...rest, { path, isNew: false, isDeleted: true, added: 0, removed, diff: source }]
      }
      // Edited back to how it was: nothing to show for it.
      if (added === 0 && removed === 0) return rest
      return [...rest, { path, isNew: first === null, isDeleted: false, added, removed, diff: source }]
    })
  }
  if (wasEmpty && (await read($, files)).length > 0 && (await mayOpenUnasked($))) void open($).catch(() => undefined)
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
  // Kept in the store too: a /clear, or a plan approved with a fresh context,
  // starts a new session whose state knows nothing of the layout.
  const known = (await read($, docks)) ?? (await $.store.get('docks').catch(() => undefined))
  return known === true
}

/**
 * Whether the file is there at all, unlike textOf, which also fails on one too
 * big to read; `unsure` is the answer when the engine cannot say.
 */
const exists = ($: EngineInterface, path: string, unsure: boolean) => $.fs.exists(path).catch(() => unsure)

/** Who sends a prompt that starts a new list: the person, not a task's notice or a peer. */
const PERSON = ['composer', 'bridge', 'sdk', 'slack-ping']

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
    await $.store.set('docks', e.presentation.isFullscreen).catch(() => undefined)
    // Asked for: it takes the keyboard, so the arrows work at once.
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (!opened.isPlaced) return { text: `Le panneau est ouvert mais pas encore affiché : ${opened.reason}` }

    // In a git repository the fullscreen terminal docks Claude Code's own diff
    // panel as Claude edits, over every plugin pane. Said once a session.
    if (e.presentation.isFullscreen && !(await read($, hinted))) {
      const cwd = await $.session.cwd().catch(() => '')
      if (cwd !== '' && (await git($, ['rev-parse', '--is-inside-work-tree'], cwd))?.trim() === 'true') {
        await update($, hinted, () => true)
        return {
          text: 'Dans un dépôt git, le panneau Diff de Claude Code s’ouvre quand Claude modifie un fichier et recouvre « Fichiers modifiés ». Tapez /diff pour le fermer : Claude Code s’en souviendra.',
        }
      }
    }

    return {}
  })

  // A new message from the person starts a new list; a slash command does not,
  // nor what the engine delivers on its own: a background task's notice, a
  // scheduled prompt, another session's message.
  on('prompt.submit', async ($, e, next) => {
    if (PERSON.includes(e.origin.kind) && !e.text.trimStart().startsWith('/')) {
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

    const kept = await read($, originals)
    const before = path in kept ? (kept[path] ?? null) : await textOf($, path)
    // There but unreadable (past 4 MiB, say): no diff to show, so not followed.
    if (!(path in kept) && before === null && (await exists($, path, false))) return next(e)

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const after = await textOf($, path)
    if (after === null && (await exists($, path, false))) return ran
    await record($, [{ path, before, after }])

    return ran
  })

  // Claude often writes, edits and deletes files through the shell. Around each
  // command: the files it names for removal and the ones already listed, and in
  // a git repository every file git sees changed, untracked or deleted, each
  // looked at before and after; a file whose size or time moved, that came or
  // went, changed.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e as { command?: unknown }).command
    if (typeof command !== 'string') return next(e)
    const cwd = await $.session.cwd().catch(() => '')
    const root = cwd === '' ? null : ((await git($, ['rev-parse', '--show-toplevel'], cwd))?.trim() || null)
    const dirty = async () => {
      if (root === null) return new Map<string, string>()
      const status = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], root)
      return dirtyIn(status ?? '', root)
    }

    const dirtyBefore = await dirty()
    // A repository with a crowd of changes: their texts are not all read before
    // each command, so a file already changed is followed once the mod knows it.
    const isCrowded = dirtyBefore.size > MOST_DIRTY
    const listed = (await read($, files)).filter(file => !file.isDeleted).map(file => file.path)
    const watched = new Set([...removalsOf(command, cwd), ...listed, ...(isCrowded ? [] : dirtyBefore.keys())])
    const kept = await read($, originals)
    const seen = new Map<string, { stamp: string | null; text: string | null }>()
    for (const path of watched) {
      const stamp = await stampOf($, path)
      seen.set(path, { stamp, text: stamp === null || path in kept ? null : await textOf($, path) })
    }

    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const dirtyAfter = await dirty()
    const touched = new Set<string>()
    for (const [path, { stamp }] of seen) if ((await stampOf($, path)) !== stamp) touched.add(path)
    // Newly changed, untracked or deleted: few, whatever the repository holds,
    // and git's index has their text before.
    for (const path of dirtyAfter.keys()) if (!dirtyBefore.has(path)) touched.add(path)
    // Back to as committed: only where the text before was read.
    if (!isCrowded) for (const path of dirtyBefore.keys()) if (!dirtyAfter.has(path) && !seen.has(path)) touched.add(path)
    if (touched.size === 0) return ran

    const changes: Change[] = []
    for (const path of touched) {
      const known = seen.get(path)
      // The text before: kept, read just now, or, for a file git had clean, the committed one.
      const before =
        path in kept
          ? (kept[path] ?? null)
          : known !== undefined
            ? known.stamp === null
              ? null
              : known.text
            : dirtyBefore.has(path) || root === null
              ? null
              : await git($, ['show', `:${path.slice(root.length + 1)}`], root)
      const isThere = await exists($, path, true)
      const after = isThere ? await textOf($, path) : null
      // There but unreadable, or a folder: nothing to show.
      if (isThere && after === null) continue
      changes.push({ path, before, after })
    }
    await record($, changes)

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

  // A drawing that throws makes the engine drop the pane: never let it.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
      return await draw($, e)
    } catch (error) {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold>Fichiers modifiés</Text>
          <Text dimColor>{`Affichage impossible : ${error instanceof Error ? error.message : String(error)}`}</Text>
        </Box>
      )
    }
  })
}

async function draw($: EngineInterface, e: RenderInput) {
  {
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
      const badge = badgeOf(file)

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
                props={{ name, dir, isOpen, isDeleted: file.isDeleted === true }}
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
            const badge = badgeOf(file)
            return (
              <Box key={`row-${key}`} flexDirection="column">
                <Box gap={1}>
                  <Text color="#0A84FF">{isAt ? '❯' : ' '}</Text>
                  <Text bold color={badge.color}>
                    {badge.letter}
                  </Text>
                  <Button key={key} plain dimColor={file.isDeleted === true ? true : undefined} autoFocus={index === 0 ? true : undefined} onPress={toggle(file.path)}>
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
  }
}
