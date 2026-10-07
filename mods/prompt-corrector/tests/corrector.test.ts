import { mock, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'

const KEY = { options: { jevApiKey: 'jev-test-key' } }
const TYPED = 'peux tu corigé le bug dans src/planning.ts stp'
const FIXED = 'Peux-tu corriger le bug dans src/planning.ts stp'

/**
 * Stands for what lies beneath the mod: Jev answering with `noul`, Haiku with
 * `reply`, a prompt box, and a record of what reached each and what was sent.
 */
function world(on: On, given: { noul?: number; jevStatus?: number; reply?: string; isFilled?: boolean } = {}) {
  mock.clock(on, { now: 0 })
  const state = { jev: [] as { url: string; auth?: string; body: unknown }[], haiku: [] as string[], box: [] as string[], sent: [] as string[], toasts: [] as string[] }

  on('http.fetch', (_, e) => {
    state.jev.push({ url: e.url, auth: e.init?.headers?.Authorization, body: JSON.parse(e.init?.body ?? 'null') })
    const status = given.jevStatus ?? 200

    return { value: { status, ok: status === 200, headers: {}, text: JSON.stringify({ answers: { has_mistakes: { type: 'noul', noul: given.noul ?? 0.9 } } }) } }
  })
  on('model.complete', (_, e) => {
    state.haiku.push(e.model)

    return { value: { isAnswered: true, text: given.reply ?? `<message>\n${FIXED}\n</message>`, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('prompt.fill', (_, e) => {
    if (given.isFilled === false) return { isFilled: false }
    state.box.push(e.text)

    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    state.sent.push(e.text)

    return { text: e.text }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => ({ value: void state.toasts.push(e.text) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return state
}

const typed = ($: Engine, text: string, origin: PromptOrigin = { kind: 'composer' }) => $.prompt.submit({ text, origin, wait: false })

test('puts the correction in the prompt box instead of sending the prompt', KEY, async ($, on) => {
  const w = world(on)
  const result = await typed($, TYPED)

  expect(result.drop).toContain('fixed some typos')
  expect(w.box).toEqual([FIXED])
  expect(w.sent).toEqual([])
  expect(w.haiku).toEqual(['haiku'])
  expect(w.jev[0]).toEqual({ url: 'https://api.typesafe.ai/v1/systemone', auth: 'Bearer jev-test-key', body: expect.objectContaining({ state: TYPED, model: 'jev-latest' }) })
})

test('sends the next Enter as the box holds it, accepted or edited, without checking it again', KEY, async ($, on) => {
  const w = world(on)
  await typed($, TYPED)
  await typed($, `${FIXED}, merci`)

  expect(w.sent).toEqual([`${FIXED}, merci`])
  expect(w.jev.length).toBe(1)
})

test('sends the prompt as typed when Jev finds no mistakes, without calling Haiku', KEY, async ($, on) => {
  const w = world(on, { noul: 0.1 })
  await typed($, TYPED)

  expect(w.sent).toEqual([TYPED])
  expect(w.haiku).toEqual([])
})

test('sends the prompt as typed when Jev fails', KEY, async ($, on) => {
  const w = world(on, { jevStatus: 401 })
  await typed($, TYPED)

  expect(w.sent).toEqual([TYPED])
  expect(w.haiku).toEqual([])
})

test('sends the prompt as typed when the correction changed a path', KEY, async ($, on) => {
  const w = world(on, { reply: '<message>Peux-tu corriger le bug dans src/Planning.ts stp</message>' })
  await typed($, TYPED)

  expect(w.sent).toEqual([TYPED])
  expect(w.box).toEqual([])
})

test('sends the prompt as typed when the box cannot take the correction', KEY, async ($, on) => {
  const w = world(on, { isFilled: false })
  await typed($, TYPED)

  expect(w.sent).toEqual([TYPED])
})

test('leaves alone prompts nobody typed at the prompt', KEY, async ($, on) => {
  const w = world(on)
  await typed($, TYPED, { kind: 'task-notification' })

  expect(w.sent).toEqual([TYPED])
  expect(w.jev).toEqual([])
})

test('does nothing without a Jev key, and says so when the session starts', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/p' } as never)
  await typed($, TYPED)

  expect(w.toasts).toEqual(['Prompt Corrector needs a Jev API key to run. Set it with /config.'])
  expect(w.sent).toEqual([TYPED])
  expect(w.jev).toEqual([])
})
