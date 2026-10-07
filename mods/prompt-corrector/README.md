# Prompt Corrector

Fixes the typos in your prompt before Claude reads it. When you press Enter on a prompt with mistakes, the prompt is not sent: the corrected version takes its place in the prompt box, and you send it with Enter, or edit it first.

Only mistakes are fixed: spelling, accents, agreement, conjugation, missing hyphens. The prompt keeps its language, its wording and its tone. English words in a French sentence (`check`, `deploy`, `refactor`) stay English, and chat abbreviations (`pk`, `stp`, `tkt`) stay as typed. Code, paths, file names, URLs, commands, flags, identifiers and @mentions are never touched.

## How it decides

Every prompt you type goes to [Jev](https://docs.typesafe.ai), a TypeSafe model that answers a question with a probability instead of text. It is asked whether the prompt has mistakes, which takes a fraction of a second and costs almost nothing ($0.042 per million tokens). Only when Jev says yes does Claude Haiku write the correction, so a clean prompt goes straight through.

The correction is offered only when it is safe to: when it changed something, kept roughly the same length, and kept every piece of code, path, URL, flag and identifier of your prompt exactly as typed. Otherwise your prompt is sent as you typed it, and so it is whenever Jev or Haiku fails or takes too long.

## Using it

- Type and press Enter as usual. A prompt with mistakes comes back corrected in the box, with a line saying so. Press Enter to send it, or edit it and press Enter.
- That next Enter always sends: whatever the box then holds is sent without a second check.
- Slash commands, `!` shell lines, single words, prompts with an image and prompts longer than 4,000 characters (mostly pasted material) are sent without a check, as is anything that does not come from your keyboard: a background task's notice, a scheduled prompt, another session's message.

## Install

```bash
claude plugin marketplace add endless-fr/claude-mods
```

```bash
claude plugin install prompt-corrector@endless-claude-mods
```

Install asks for two settings, which `/config` changes later:

- **Jev API key**: your TypeSafe API key, from [console.typesafe.ai](https://console.typesafe.ai). Kept in your system's secure storage. Without it the mod does nothing and says so when a session starts.
- **Mistake threshold**: how sure Jev must be, from 0 to 1, before Haiku corrects a prompt. 0.5 by default; raise it if clean prompts get corrected, lower it if mistakes slip through.

Run `/reload-plugins` in a session that is already open. Requires Claude Code v2.1.287 or later.

## What it reads, sends and costs

- **Reads** each prompt you type, when you press Enter.
- **Sends** that prompt to TypeSafe's API (`api.typesafe.ai`) with your Jev key, to ask whether it has mistakes. Prompts with mistakes then go to Claude Haiku through your own Claude Code account, as Claude Code's other small requests do.
- **Costs**: Jev's price per call is a fraction of a cent per thousand prompts, billed to your TypeSafe account. Haiku's calls count against your Claude Code plan.
- **Keeps** nothing past the correction it last put in the box.

## Limits

- Jev is trained mostly on English; TypeSafe says other languages work but less accurately. If it misses mistakes in French prompts, lower the threshold.
- Haiku sometimes still turns an English word into French (`durations` into `durées`). Edit the box before sending when it does.
- Each prompt waits for Jev before it is sent, typically under half a second, at most two seconds. A corrected prompt also waits for Haiku.

## Develop

```bash
claude plugin validate mods/prompt-corrector
```

```bash
claude plugin test mods/prompt-corrector
```

The rules live in [hooks/correct.ts](hooks/correct.ts), free of any engine call: which prompts are checked, the question Jev is asked, Haiku's instructions and the checks a correction must pass. [hooks/register.ts](hooks/register.ts) wires them to the prompt.
