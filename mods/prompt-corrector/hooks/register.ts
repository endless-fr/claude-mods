import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { JEV_URL, SYSTEM, correctedOf, correctionPromptOf, isWorthChecking, jevRequestOf, offerOf, probabilityOf } from './correct'

const JEV_TIMEOUT_MS = 2_000
const HAIKU_TIMEOUT_MS = 15_000
const OFFERED = 'Prompt Corrector fixed some typos. Check the prompt, edit it if you like, then press Enter to send it.'
const NO_KEY = 'Prompt Corrector needs a Jev API key to run. Set it with /config.'

type Settings = { key: string; threshold: number }

function settingsOf(options: PluginOptions): Settings {
  const threshold = Number(options.threshold)

  return {
    key: typeof options.jevApiKey === 'string' ? options.jevApiKey.trim() : '',
    threshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 1 ? threshold : 0.5,
  }
}

/** True when Jev finds mistakes likely enough; false on any failure, so the prompt goes as typed. */
async function hasMistakes($: EngineInterface, text: string, settings: Settings, signal: AbortSignal): Promise<boolean> {
  const asked = $.http.fetch(JEV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(jevRequestOf(text)),
  })
  const late = $.clock.sleep(JEV_TIMEOUT_MS, { signal }).then(() => null)
  const reply = await Promise.race([asked, late]).catch(() => null)
  if (!reply?.ok) return false
  const probability = probabilityOf(reply.text)

  return probability !== null && probability >= settings.threshold
}

/** Haiku's correction when it can be offered, else null. */
async function correctionOf($: EngineInterface, text: string): Promise<string | null> {
  await $.ui.status('Correcting typos…')
  try {
    const reply = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: correctionPromptOf(text),
      maxTokens: Math.min(4_000, Math.ceil(text.length / 2) + 200),
      effort: 'low',
      timeoutMs: HAIKU_TIMEOUT_MS,
    })

    return reply.isAnswered ? offerOf(text, correctedOf(reply.text)) : null
  } finally {
    await $.ui.status(undefined)
  }
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)
  // The correction put in the prompt box, until the person sends what the box
  // then holds, as offered or as they edited it. A reload forgets it, and the
  // next prompt is checked again.
  let offered: string | null = null

  on('session.start', async ($, e, next) => {
    if (!settings.key) await $.ui.toast(NO_KEY)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only what the person typed at the prompt: a box to put the correction back in.
    if (e.origin.kind !== 'composer') return next(e)
    if (offered !== null) {
      offered = null

      return next(e)
    }
    if (!settings.key || !isWorthChecking(e.text, (e.attachments?.length ?? 0) > 0)) return next(e)
    if (!(await hasMistakes($, e.text, settings, next.signal))) return next(e)
    const fixed = await correctionOf($, e.text)
    if (fixed === null) return next(e)
    const { isFilled } = await $.prompt.fill({ text: fixed, mode: 'replace' })
    if (!isFilled) return next(e)
    offered = fixed

    return { drop: OFFERED }
  }).catch(($, e, next) => next(e)) // a check that fails never holds a prompt back
}
