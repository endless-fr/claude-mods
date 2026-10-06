import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { keyOf } from '../hooks/designs'

const DIR = '/projet'
const A = `${DIR}/a.txt`
const B = `${DIR}/b.txt`

/** The engine beneath: a disk in memory, which the write tools change and the mod reads back. */
function world(on: On, opens: string[] = [], repo?: { head: Record<string, string> }) {
  const disk = new Map<string, string>(Object.entries(repo?.head ?? {}))
  // Each write moves the file's time, as a disk does.
  const times = new Map<string, number>()
  let clock = 0
  const put = (path: string, text: string) => {
    disk.set(path, text)
    times.set(path, ++clock)
  }
  on('tool.call', async (_$, e) => {
    const input = e as Record<string, unknown>
    if (e.tool === 'Bash') {
      // Just enough of a shell on the disk in memory: `cat >` and `cat >>`
      // with a here-document, `rm` and `mv`.
      const command = input.command as string
      const at = (path: string) => (path.startsWith('/') ? path : `${DIR}/${path.replace(/^src\/\.\.\//, '')}`)
      const heredoc = /^cat (>>?) (\S+) <<'EOF'\n([\s\S]*)\nEOF$/.exec(command)
      if (heredoc) {
        const [, how, path, text] = heredoc as unknown as [string, string, string, string]
        put(at(path), (how === '>>' ? (disk.get(at(path)) ?? '') : '') + `${text}\n`)
        return { result: {} as never }
      }
      const [name, ...args] = command.replace(/^git /, '').split(' ').filter(word => !word.startsWith('-'))
      if (name === 'rm') for (const path of args) disk.delete(at(path))
      if (name === 'mv') {
        put(at(args[1]!), disk.get(at(args[0]!)) ?? '')
        disk.delete(at(args[0]!))
      }
      return { result: {} as never }
    }
    const path = input.file_path as string
    if (e.tool === 'Write') put(path, input.content as string)
    if (e.tool === 'Edit') put(path, (disk.get(path) ?? '').replace(input.old_string as string, input.new_string as string))
    return { result: {} as never }
  })
  on('fs.read', async (_$, e) => {
    const text = disk.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.exists', async (_$, e) => ({ value: disk.has(e.path) as never }))
  on('fs.stat', async (_$, e) => {
    const text = disk.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: { kind: 'file', size: text.length, mtimeMs: times.get(e.path) ?? 0, isLink: false } as never }
  })
  on('ui.open', async (_$, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } as never }
  })
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('session.cwd', async () => ({ value: DIR as never }))
  on('process.run', async (_$, e) => {
    const argv = e.argv as readonly string[]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never })
    if (!repo || argv[0] !== 'git') return { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } as never }
    if (argv[1] === 'rev-parse') return ok(`${DIR}\n`)
    const relative = (path: string) => path.slice(DIR.length + 1)
    if (argv[1] === 'status') {
      const lines: string[] = []
      for (const [path, text] of Object.entries(repo.head)) {
        if (!disk.has(path)) lines.push(` D ${relative(path)}`)
        else if (disk.get(path) !== text) lines.push(` M ${relative(path)}`)
      }
      for (const path of disk.keys()) if (!(path in repo.head)) lines.push(`?? ${relative(path)}`)
      return ok(lines.map(line => `${line}\0`).join(''))
    }
    if (argv[1] === 'show') {
      const text = repo.head[`${DIR}/${argv[2]!.replace(/^(HEAD)?:/, '')}`]
      return text === undefined ? { value: { exitCode: 128, stdout: '', stderr: 'not in index', isStdoutTruncated: false, isStderrTruncated: false } as never } : ok(text)
    }
    return ok('')
  })
}

const write = ($: Engine, path: string, content: string) => $.tool.call({ tool: 'Write', file_path: path, content } as never)
const bash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command } as never)
const edit = ($: Engine, path: string, from: string, to: string) =>
  $.tool.call({ tool: 'Edit', file_path: path, old_string: from, new_string: to } as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: lists this turn's files, unfolds a diff, and starts over on a new message`, async ($, on) => {
    world(on)
    await write($, A, 'one\ntwo\n')
    await edit($, A, 'two', 'deux')
    await write($, B, 'hello\n')
    await $.tool.call({ tool: 'Read', file_path: A } as never)

    const pane = await $.ui.mount({ plugin: 'changed-files', surface, component: 'Pane', props: {} as never, requestId: 'changed-files' })
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('a.txt')
    expect(drawn).toContain('b.txt')
    expect(drawn).not.toContain('"Code"')

    if (surface === 'desktop') {
      await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: keyOf(A) } as never)
      await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: keyOf(A) } as never)
    } else {
      await pane.press({ key: keyOf(A) } as never)
    }
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('"Code"')
    expect(drawn).toContain('+one')
    expect(drawn).toContain('+deux')

    await $.prompt.submit({ text: '/changed-files', origin: { kind: 'composer' } } as never)
    expect(JSON.stringify(await pane.drawn())).toContain('a.txt')

    await $.prompt.submit({ text: 'Merci, autre chose', origin: { kind: 'composer' } } as never)
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).not.toContain('a.txt')
    expect(drawn).not.toContain('b.txt')

    await edit($, B, 'hello', 'bonjour')
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('b.txt')
    expect(drawn).not.toContain('a.txt')
  })
}

for (const isFullscreen of [false, true]) {
  test(`terminal ${isFullscreen ? 'fullscreen' : 'main screen'}: opens the pane on its own only as a sidebar`, async ($, on) => {
    const opens: string[] = []
    world(on, opens)
    on('session.surfaces', async () => ({ value: ['terminal'] as never }))
    on('command.run', async () => ({}))

    await $.command.run({ command: 'changed-files', presentation: { isFullscreen, columns: 160 } } as never)
    opens.length = 0
    await write($, A, 'one\n')
    expect(opens.length).toBe(isFullscreen ? 1 : 0)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a file the shell deletes shows D and its removed lines`, async ($, on) => {
    const C = `${DIR}/c.txt`
    // c.txt is in git; a.txt Claude edits, then removes; b.txt it makes, then removes.
    world(on, [], { head: { [C]: 'gamma\ndelta\n', [A]: 'one\n' } })
    await edit($, A, 'one', 'uno')
    await write($, B, 'temp\n')
    await bash($, `rm a.txt ${B}`)
    await bash($, 'git rm -q src/../c.txt')

    const pane = await $.ui.mount({ plugin: 'changed-files', surface, component: 'Pane', props: {} as never, requestId: 'changed-files' })
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('c.txt')
    expect(drawn).toContain('a.txt')
    // Made and gone in the same reply: nothing to show.
    expect(drawn).not.toContain('b.txt')
    expect(drawn).toContain('"D"')

    if (surface === 'desktop') {
      await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: keyOf(C) } as never)
      await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: keyOf(C) } as never)
    } else {
      await pane.press({ key: keyOf(C) } as never)
    }
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('-gamma')
    expect(drawn).toContain('-delta')
  })
}

test('outside a repository, rm still counts for the files it names', async ($, on) => {
  world(on)
  await write($, A, 'one\n')
  await $.prompt.submit({ text: 'next', origin: { kind: 'composer' } } as never)
  await bash($, 'rm -f a.txt')
  const pane = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'changed-files' })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('a.txt')
  expect(drawn).toContain('"D"')
})

test("a background task's notice or a peer's message keeps the list", async ($, on) => {
  world(on)
  await write($, A, 'one\n')
  await $.prompt.submit({ text: 'Background command "sleep 5" completed', origin: { kind: 'task-notification' } } as never)
  await $.prompt.submit({ text: 'Hello from the other session', origin: { kind: 'peer' } } as never)
  const pane = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'changed-files' })
  expect(JSON.stringify(await pane.drawn())).toContain('a.txt')

  await $.prompt.submit({ text: 'Merci', origin: { kind: 'composer' } } as never)
  expect(JSON.stringify(await pane.drawn())).not.toContain('a.txt')
})

test('after a /clear, the terminal still knows the pane docks', async ($, on) => {
  const opens: string[] = []
  world(on, opens)
  on('session.surfaces', async () => ({ value: ['terminal'] as never }))
  // What /changed-files kept in an earlier session; this one's state is new.
  on('store.get', async (_$, e, next) => (e.key === 'docks' ? { value: true as never } : next(e)))
  await write($, A, 'one\n')
  expect(opens.length).toBe(1)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: files the shell writes and edits are listed, in a repository or not`, async ($, on) => {
    const K = `${DIR}/keep.txt`
    world(on, [], { head: { [K]: 'alpha\n' } })
    await bash($, "cat > notes.md <<'EOF'\n# Notes\nune\nEOF")
    await bash($, "cat >> notes.md <<'EOF'\ndeux\nEOF")
    await bash($, "cat >> keep.txt <<'EOF'\nbeta\nEOF")

    const pane = await $.ui.mount({ plugin: 'changed-files', surface, component: 'Pane', props: {} as never, requestId: 'changed-files' })
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('notes.md')
    expect(drawn).toContain('keep.txt')
    expect(drawn).toContain('"A"')
    expect(drawn).toContain('"M"')

    if (surface === 'desktop') {
      await pane.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: keyOf(K) } as never)
      await pane.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: keyOf(K) } as never)
    } else {
      await pane.press({ key: keyOf(K) } as never)
    }
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('+beta')
    expect(drawn).not.toContain('+alpha')

    // Next message: an untracked file edited again diffs against how it stood.
    await $.prompt.submit({ text: 'encore', origin: { kind: 'composer' } } as never)
    await bash($, "cat >> notes.md <<'EOF'\ntrois\nEOF")
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('notes.md')
    expect(drawn).not.toContain('keep.txt')
    expect(drawn).toContain('"M"')
  })
}

test('outside a repository, a file the shell changes that is already listed is followed', async ($, on) => {
  world(on)
  await write($, A, 'one\n')
  await bash($, "cat >> a.txt <<'EOF'\ntwo\nEOF")
  const pane = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'changed-files' })
  await pane.press({ key: keyOf(A) } as never)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('+one')
  expect(drawn).toContain('+two')
})

test('in a repository with hundreds of changed files, a file the shell makes still shows, and only it', async ($, on) => {
  const head: Record<string, string> = {}
  for (let i = 0; i < 400; i++) head[`${DIR}/src/f${i}.ts`] = `export const f${i} = ${i}\n`
  world(on, [], { head })
  // 400 files changed before Claude's turn, as on a busy branch.
  for (let i = 0; i < 400; i++) await write($, `${DIR}/src/f${i}.ts`, `export const f${i} = ${i + 1}\n`)
  await $.prompt.submit({ text: 'go', origin: { kind: 'composer' } } as never)

  await bash($, "cat > new.ts <<'EOF'\nexport const n = 1\nEOF")
  const pane = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'changed-files' })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('new.ts')
  expect(drawn).toContain('1 fichier')
})
