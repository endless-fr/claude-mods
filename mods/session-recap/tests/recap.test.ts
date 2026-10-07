import { expect, test } from 'claude-code/testing'

import { MINUTE, PANE, card, clear, command, pane, request, shown, start, turn, world } from './world'
import type { World } from './world'

type Engine = Parameters<typeof start>[0]

/** A conversation that edited a file, ran its tests and cost $6.40. */
async function work($: Engine, w: World) {
  w.cost(1)
  await start($)
  await request($, w, { input_tokens: 100_000, cache_read_input_tokens: 2_000_000 })
  await $.tool.call({ tool: 'Edit', file_path: '/a/x.ts', old_string: 'one', new_string: 'one\ntwo' })
  await $.tool.call({ tool: 'Bash', command: 'bun test' })
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await turn($, 60 * MINUTE)
  await turn($, 42 * MINUTE)
  w.cost(7.4)
}

test('opens the recap when a conversation is cleared', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)

  expect(w.opened).toEqual([{ id: PANE, title: 'Session Recap', focus: true, closeOnEscape: true, holdToasts: true }])
})

test('opens nothing when the cleared conversation had no turn', async ($, on) => {
  const w = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clear($, w)

  expect(w.opened).toEqual([])
})

test('opens nothing when the session ends another way', async ($, on) => {
  const w = world(on)
  await work($, w)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: w.state.id, resume: { id: w.state.id } })

  expect(w.opened).toEqual([])
})

test('opens the recap again once a typed /clear has run, so a narrow terminal seats it as asked for', async ($, on) => {
  const w = world(on)
  await work($, w)
  w.state.onClear = () => clear($, w)
  await command($, 'clear')

  expect(w.opened.map(pane => pane.id)).toEqual([PANE, PANE])
})

test('draws the cleared conversation as a card on the desktop', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  const { source, alt } = await card($)

  for (const text of ['claude-mods', '1h 42m', '2 turns on Opus 5.5', 'Tool calls', 'Files edited', '+1', 'Most used', 'Bash', 'Test runs', '$6.40', '2.1M tokens']) expect(source).toContain(`>${text}<`)
  expect(alt).toBe('Session recap of claude-mods, 5 Jan 2026: 1h 42m worked, 2 turns on Opus 5.5. Tool calls: 3. Files edited: 1. Lines: +1 −0. Most used: Bash. Test runs: 1. Cost: $6.40, 2.1M tokens.')
})

test('draws the card as an image of no fixed size, so it takes the width of the pane', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)

  expect((await card($)).props).toEqual(['alt', 'source'])
})

test('offers to copy and to save the image on the desktop', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  const ui = await pane($, 'desktop')

  expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual(['Copy image', 'Save image'])
})

test('lists the same figures on the terminal, with nothing to press', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)

  expect(await shown($, 'terminal')).toBe(
    'claude-mods | 5 Jan 2026 | 1h 42m | 2 turns on Opus 5.5 | Tool calls | 3 | Files edited | 1 | Lines | +1 −0 | Most used | Bash | Test runs | 1 | Cost | $6.40 | 2.1M tokens',
  )
  const ui = await pane($, 'terminal')
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
})

test('leaves a refused tool call out of the count', async ($, on) => {
  const w = world(on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/a/x.ts' })
  w.state.isDenying = true
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  await turn($)
  await clear($, w)

  expect(await shown($, 'terminal')).toContain('Tool calls | 1 |')
})

test("counts a subagent's tool calls, but neither its turns nor its tokens", async ($, on) => {
  const w = world(on)
  await start($)
  await request($, w, { input_tokens: 5_000 })
  await request($, w, { input_tokens: 900_000 }, 'agent-1')
  await $.tool.call({ tool: 'Agent', description: 'Look around', prompt: 'Look around' })
  await $.tool.call({ tool: 'Read', file_path: '/a/x.ts' })
  await turn($, 30 * MINUTE, 'agent-1')
  await turn($, 5 * MINUTE)
  await clear($, w)
  const figures = await shown($, 'terminal')

  expect(figures).toContain('| 5m | 1 turn on Opus 5.5 | Tool calls | 2 |')
  expect(figures).toContain('Tokens | 5,000')
})

test('starts the next conversation from nothing', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  await $.tool.call({ tool: 'Read', file_path: '/a/x.ts' })
  await turn($, 3 * MINUTE)
  w.cost(7.9)
  await clear($, w)

  expect(await shown($, 'terminal')).toBe('claude-mods | 5 Jan 2026 | 3m | 1 turn | Tool calls | 1 | Most used | Read | Cost | $0.50')
})

test('keeps counting through a reload of the mod', async ($, on) => {
  const w = world(on)
  await work($, w)
  await start($)
  await clear($, w)

  expect(await shown($, 'terminal')).toContain('| 1h 42m | 2 turns on Opus 5.5 |')
})

test('shows the conversation so far when /session-recap is run before any /clear', async ($, on) => {
  const w = world(on)
  await work($, w)
  const ran = await command($, 'session-recap')

  expect(ran.text).toBe(undefined)
  expect(w.opened.map(pane => pane.id)).toEqual([PANE])
  expect(await shown($, 'terminal')).toContain('claude-mods | So far · 5 Jan 2026 | 1h 42m |')
})

test('shows the last cleared conversation when /session-recap is run before the next has a turn', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  await command($, 'session-recap')

  expect(await shown($, 'terminal')).toContain('claude-mods | 5 Jan 2026 | 1h 42m |')
})

test('says so when /session-recap has nothing to show', async ($, on) => {
  const w = world(on)
  await start($)
  const ran = await command($, 'session-recap')

  expect(ran.text).toBe('Nothing to recap yet. The recap opens when you /clear a conversation.')
  expect(w.opened).toEqual([])
})

test('says what to do before anything was cleared, should the pane be opened another way', async ($, on) => {
  world(on)
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) expect(await shown($, surface)).toBe('Nothing to recap yet. The recap opens when you /clear a conversation.')
})

test('copies the card as an image: Quick Look draws it, sips frames it, the clipboard takes it', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  const ui = await pane($, 'desktop')
  await ui.press({ key: 'copy' })

  expect(w.written.get('/tmp/ada/session-recap/card.svg')).toContain('viewBox="0 0 1200 1200"')
  expect(w.ran).toEqual([
    ['qlmanage', '-t', '-s', '2400', '-o', '/tmp/ada/session-recap', '/tmp/ada/session-recap/card.svg'],
    ['sips', '-c', '1350', '2400', '/tmp/ada/session-recap/card.svg.png', '--out', '/tmp/ada/session-recap/card.png'],
    ['osascript', '-e', 'set the clipboard to (read (POSIX file "/tmp/ada/session-recap/card.png") as «class PNGf»)'],
    ['rm', '-f', '/tmp/ada/session-recap/card.svg', '/tmp/ada/session-recap/card.svg.png', '/tmp/ada/session-recap/card.png'],
  ])
  expect((await ui.find({ key: 'outcome' }))?.text).toBe('Copied. Paste it anywhere.')
})

test('saves the card to Pictures and shows it in the Finder', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  const ui = await pane($, 'desktop')
  await ui.press({ key: 'save' })
  const saved = w.ran.find(argv => argv[0] === 'cp')?.[2] ?? ''

  expect(saved).toMatch(/^\/Users\/ada\/Pictures\/Session Recaps\/claude-mods-2026-01-05-\d{4}\.png$/)
  expect(w.ran.map(argv => argv[0])).toEqual(['qlmanage', 'sips', 'mkdir', 'cp', 'open', 'rm'])
  expect(w.ran.find(argv => argv[0] === 'open')).toEqual(['open', '-R', saved])
  expect((await ui.find({ key: 'outcome' }))?.text).toBe('Saved to Pictures › Session Recaps.')
})

test('says the image needs macOS where its tools are missing', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  w.state.failing = 'missing'
  const ui = await pane($, 'desktop')
  await ui.press({ key: 'copy' })

  expect((await ui.find({ key: 'outcome' }))?.text).toBe('The image needs macOS. Nothing was copied.')
})

test('says so when the image could not be made, and stops there', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  w.state.failing = 'sips'
  const ui = await pane($, 'desktop')
  await ui.press({ key: 'save' })

  expect(w.ran.map(argv => argv[0])).toEqual(['qlmanage', 'sips', 'rm'])
  expect((await ui.find({ key: 'outcome' }))?.text).toBe("Couldn't make the image. Nothing was saved.")
})

test('forgets the last outcome when the next recap opens', async ($, on) => {
  const w = world(on)
  await work($, w)
  await clear($, w)
  const first = await pane($, 'desktop')
  await first.press({ key: 'copy' })
  await first.unmount()
  await turn($)
  await clear($, w)
  const ui = await pane($, 'desktop')

  expect(await ui.find({ key: 'outcome' })).toBe(undefined)
})

test('shows the cleared conversation although /clear starts the session state over', async ($, on) => {
  const w = world(on)
  // A /clear starts a new session, whose state holds nothing of the last: what
  // the mod wrote before the session id changed is not read back after it.
  const writtenIn = new Map<string, string>()
  on('state.set', async (_$, e, next) => {
    writtenIn.set(e.key, w.state.id)
    return next(e)
  })
  on('state.get', async (_$, e, next) => (writtenIn.get(e.key) === w.state.id ? next(e) : ({ value: { value: undefined, version: 0 } } as never)))

  await work($, w)
  await clear($, w)
  expect(await shown($, 'terminal')).toContain('2 turns on Opus 5.5')

  await command($, 'session-recap')
  expect(await shown($, 'terminal')).toContain('2 turns on Opus 5.5')
})
