import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { keyOf } from '../hooks/designs'

const DIR = '/projet'
const A = `${DIR}/a.txt`
const B = `${DIR}/b.txt`

/** The engine beneath: a disk in memory, which the write tools change and the mod reads back. */
function world(on: On, opens: string[] = []) {
  const disk = new Map<string, string>()
  on('tool.call', async (_$, e) => {
    const input = e as Record<string, unknown>
    const path = input.file_path as string
    if (e.tool === 'Write') disk.set(path, input.content as string)
    if (e.tool === 'Edit') disk.set(path, (disk.get(path) ?? '').replace(input.old_string as string, input.new_string as string))
    return { result: {} as never }
  })
  on('fs.read', async (_$, e) => {
    const text = disk.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('ui.open', async (_$, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } as never }
  })
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
}

const write = ($: Engine, path: string, content: string) => $.tool.call({ tool: 'Write', file_path: path, content } as never)
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
      // The name is the control, with the digit of its place: b.txt, newest, is 1.
      expect(drawn).toContain('"hotkey":"2"')
      await pane.press({ key: keyOf(A) } as never)
    }
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('"Code"')
    expect(drawn).toContain('+one')
    expect(drawn).toContain('+deux')

    await $.prompt.submit({ text: '/changed-files' } as never)
    expect(JSON.stringify(await pane.drawn())).toContain('a.txt')

    await $.prompt.submit({ text: 'Merci, autre chose' } as never)
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
