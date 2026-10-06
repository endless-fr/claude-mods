import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement } from 'claude-code'

import type { Recap, Stats } from '../types'
import { cardSvg } from './card'
import { copyOf, drawingOf, savingOf } from './export'
import { altOf, emptyStats, recapOf, tilesOf, withCall, withStep, withTurn } from './stats'
import type { Call } from './stats'

const PANE = 'session-recap'
const TITLE = 'Session Recap'
const NOTHING = 'Nothing to recap yet. The recap opens when you /clear a conversation.'

const stats = atom({ plugin: 'session-recap', key: 'stats' } as const, null as Stats | null)
const card = atom({ plugin: 'session-recap', key: 'card' } as const, null as Recap | null)
const outcome = atom({ plugin: 'session-recap', key: 'outcome' } as const, '')

// True from the moment a /clear froze a recap until the command that typed it has run.
let hasCleared = false

const costOf = async ($: EngineInterface) => (await $.session.usage()).cost?.usd ?? null

/** The arguments of a tool call the counts read, whichever tool it was. */
function callOf(e: { tool: string }): Call {
  const input = e as Record<string, unknown>
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)

  return {
    tool: e.tool,
    filePath: text('file_path') ?? text('notebook_path'),
    oldText: text('old_string'),
    newText: text('new_string') ?? text('content') ?? text('new_source'),
    command: text('command'),
    skill: text('skill'),
  }
}

/** The running conversation as a recap, and what the session has cost by now; no recap before its first turn ends. */
async function freeze($: EngineInterface, isSoFar: boolean): Promise<{ recap: Recap | null; cost: number | null }> {
  const counted = await read($, stats)
  const cost = await costOf($)
  if (!counted || counted.turns === 0) return { recap: null, cost }

  return { recap: recapOf(counted, { now: await $.clock.now(), cwd: await $.session.cwd(), cost, isSoFar }), cost }
}

async function show($: EngineInterface, recap: Recap) {
  await update($, card, () => recap)
  await update($, outcome, () => '')
}

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, holdToasts: true })

/** Runs one command; true when it exited cleanly. Rejects when it cannot start. */
const done = async ($: EngineInterface, argv: string[]) => (await $.process.run(argv, { timeoutMs: 20_000 })).exitCode === 0

/** Runs the commands in order; true when every one exited cleanly, stopping at the first that did not. */
async function allDone($: EngineInterface, list: string[][]) {
  for (const argv of list) if (!(await done($, argv))) return false

  return true
}

async function copy($: EngineInterface, png: string) {
  return (await done($, copyOf(png))) ? 'Copied. Paste it anywhere.' : "Couldn't reach the clipboard. Nothing was copied."
}

async function save($: EngineInterface, recap: Recap, png: string) {
  const home = await $.env.get('HOME')
  if (!home) return "Couldn't find your home folder. Nothing was saved."
  const saving = savingOf(recap, png, home)
  if (!(await allDone($, saving.file))) return "Couldn't write to Pictures. Nothing was saved."
  await done($, saving.reveal)

  return `Saved to ${saving.where}.`
}

/** Makes the image of the card on show, copies or saves it, and resolves to what to tell the person. */
async function image($: EngineInterface, recap: Recap, isSave: boolean): Promise<string> {
  const nothing = isSave ? 'Nothing was saved.' : 'Nothing was copied.'
  const drawing = drawingOf(recap, await $.env.get('TMPDIR'))
  try {
    await $.fs.write(drawing.svg, drawing.source)
    try {
      if (!(await allDone($, drawing.draw))) return `Couldn't make the image. ${nothing}`

      return isSave ? await save($, recap, drawing.png) : await copy($, drawing.png)
    } finally {
      await $.process.run(drawing.clean)
    }
  } catch {
    // A command that cannot start: these tools are macOS's own.
    return `The image needs macOS. ${nothing}`
  }
}

/** A press of Copy image or Save image: makes the image and says what came of it. */
async function share($: EngineInterface, isSave: boolean) {
  const recap = await read($, card)
  if (!recap) return
  await update($, outcome, () => '')
  const said = await image($, recap, isSave)
  await update($, outcome, () => said)
}

function desktopPane($: EngineInterface, { Box, Button, Svg, Text }: Elements['desktop'], recap: Recap, said: string): RenderElement {
  return (
    <Box flexDirection="column" gap={1}>
      {/* An image, not `isInteractive`: it takes the pane's width and still
          animates, where the frame stays 150 tall and the card shrinks into it. */}
      <Svg source={cardSvg(recap)} alt={altOf(recap)} />
      <Box gap={1} alignItems="center">
        <Button key="copy" variant="primary" onPress={() => void share($, false)}>
          Copy image
        </Button>
        <Button key="save" variant="secondary" onPress={() => void share($, true)}>
          Save image
        </Button>
        {said ? (
          <Box key="outcome">
            <Text dimColor>{said}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

/** The same figures as rows of text, where no surface draws the card. */
function listPane({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, recap: Recap): RenderElement {
  const { headline, accent, small } = tilesOf(recap)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={1}>
        <Text bold>{headline.project}</Text>
        <Text dimColor>{headline.date}</Text>
      </Box>
      <Box gap={1} marginBottom={1}>
        <Text bold>{headline.time}</Text>
        <Text dimColor>{headline.note}</Text>
      </Box>
      {[accent, ...small].map(tile => (
        <Box gap={1}>
          <Box width={13}>
            <Text dimColor>{tile.label}</Text>
          </Box>
          <Text bold>{tile.removed ? `${tile.value} ${tile.removed}` : tile.value}</Text>
          {tile.note ? <Text dimColor>{tile.note}</Text> : null}
        </Box>
      ))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'session-recap', description: 'Show the recap of this conversation, or of the last one you cleared' })
    // A reload of the mod starts this module over, not the conversation.
    if ((await read($, stats)) === null) {
      const cost = await costOf($)
      await update($, stats, counted => counted ?? emptyStats(cost))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) await update($, stats, counted => withCall(counted ?? emptyStats(null), callOf(e)))

    return ran
  })

  // Each request of the main conversation: a subagent's tokens are its own.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const { usage } = result
    if (e.agentId === undefined && usage) await update($, stats, counted => withStep(counted ?? emptyStats(null), usage))

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await update($, stats, counted => withTurn(counted ?? emptyStats(null), e.durationMs))

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') return next(e)
    // The process goes on with a new conversation, and no session.start says so.
    const { recap, cost } = await freeze($, false)
    await update($, stats, () => emptyStats(cost))
    if (recap) await show($, recap)
    const ended = await next(e)
    if (recap) {
      hasCleared = true
      await open($).catch(() => undefined)
    }

    return ended
  })

  on('command.run', { command: 'clear' }, async ($, e, next) => {
    hasCleared = false
    const ran = await next(e)
    // Opened from session.end the pane is unasked for, and waits undrawn on a
    // narrow terminal. Here the person's own command is behind it.
    if (hasCleared) await open($).catch(() => undefined)
    hasCleared = false

    return ran
  })

  on('command.run', { command: 'session-recap' }, async $ => {
    const { recap } = await freeze($, true)
    if (recap) await show($, recap)
    else if ((await read($, card)) === null) return { text: NOTHING }
    const opened = await open($)

    return opened.isPlaced ? {} : { text: `Session Recap is open but not drawn yet: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const recap = await read($, card)
    const said = await read($, outcome)
    if (!recap) {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box paddingX={1}>
          <Text dimColor>{NOTHING}</Text>
        </Box>
      )
    }

    return e.surface === 'desktop' ? desktopPane($, $.ui.resolve(e), recap, said) : listPane($.ui.resolve(e), recap)
  })
}
