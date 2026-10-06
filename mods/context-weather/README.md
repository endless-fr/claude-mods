# Context Weather

One band above the Claude Code prompt that says how the session is doing: how full the context is, how fast you are using your limits, whether the prompt cache is still warm, what the session has cost, and which subagents are running.

In the terminal it is one capsule around one line:

```text
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ◔ 312k 31% ▂▃▅▂█ +27.4k · 5h 48% ━━━┃──── 2h 54m · 7d 52% ━━━━┃─── 3d 2h · cache 41m · $18.42 +$2.31 · 3 agents │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

In the Desktop app it is one neutral capsule with the same blocks. On both, values are plain, labels and details are dim, and colour appears only where something needs attention: yellow for a warning, red for an alert.

## What each block says

- **Context**: a glyph for how full the context window is, the tokens it holds, one bar per recent turn as tall as what that turn added, and the last turn's change. The weather goes Clear, Cloudy (from 30% of the window), Rain (55%), Storm (75%, yellow) and Compact soon (90%, red). The Desktop app draws the weather, and shows the share of the window when you hover it. The terminal draws a disc that fills through the same five steps (`○ ◔ ◑ ◕ ●`) and writes the share next to the tokens.
- **5h / 7d**: the share of each account limit already used, and the time to its reset. The gauge marks where the clock stands in the window: a bar past the mark means you are using faster than time passes. Yellow when usage is more than 5 points ahead of the clock; red when it is 20 points ahead or 90% is used. In the Desktop app, hover the clock for the 5-hour reset time. These windows exist on a Claude subscription only. The newest reading is shared by every session on the machine, and a window that has already reset is hidden until its next reading.
- **Cache**: the time before the main conversation's prompt cache lapses. Each request starts the countdown again. Yellow in the last fifth of the cache's life, and red `expired` once it has lapsed, with what the next message writes again on a large context. When a request had to write the prompt again, the block says why: `model changed`, `expired` or `prefix changed`.
- **Cost**: what the session has cost, as `/cost` totals it, and what the last turn added. On a subscription this is the API-price equivalent, not a bill.
- **Heavy thread**: shown from 300k tokens of context (red from 600k). Every request reads the whole context again, so a long thread pays for its length at each step. The figure is how many times a fresh thread's load you are carrying; a fresh thread's load is the lightest first turn of your last five new threads, and the figure is left out until one has been measured.
- **Agents**: the number of subagents running, shown only while some run. In the Desktop app, hover the icon for what each is doing.

When the terminal is too narrow for the whole line, the bars and details drop out first, then everything but the figures and the warnings. Where the band has fewer than three rows to itself, the line is drawn without its border.

## How the cache countdown is worked out

Claude Code gives mods each request's cache token counts but not the cache's lifetime, so the mod follows [Claude Code's own rules](https://code.claude.com/docs/en/prompt-caching#cache-lifetime): one hour on a subscription within its plan's usage, five minutes otherwise, unless `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, the `promptCacheTtl` setting or `ENABLE_PROMPT_CACHING_1H` says otherwise. It then corrects itself from the traffic: a request the cache served after more than five minutes proves the hour, and a rewrite within the hour proves five minutes. `DISABLE_PROMPT_CACHING` hides the block.

## Install

```bash
claude plugin marketplace add endless-fr/claude-mods
```

```bash
claude plugin install context-weather@endless-claude-mods
```

Run `/reload-plugins` in a session that is already open. Requires Claude Code v2.1.287 or later in the terminal, v2.1.286 or later in the Desktop app.

## What it reads and keeps

The mod makes no network requests and sends nothing anywhere.

- **Reads**: the usage figures Claude Code provides (context, limits, cost, each main-conversation request's cache token counts), the list of the session's subagents, the `promptCacheTtl` setting and the four prompt-cache environment variables named above plus `DISABLE_PROMPT_CACHING`.
- **Keeps**, in the plugin's own store on your machine: the newest limits reading; per session, the last twelve turn readings, the last request's cache figures and the last turn's cost (deleted after seven idle days); and the first-turn load of your last five new threads.

To list this yourself before installing, run `claude plugin validate mods/context-weather` from a clone.

## Develop

```bash
claude plugin validate mods/context-weather
```

```bash
claude plugin test mods/context-weather
```

The rules live in [hooks/measure.ts](hooks/measure.ts), free of any drawing or engine call. [hooks/terminal.tsx](hooks/terminal.tsx) and [hooks/desktop.tsx](hooks/desktop.tsx) draw what it works out, and [hooks/register.tsx](hooks/register.tsx) wires both to the session.

## Credits

Inspired by Eric Cologni's [token-weather-usage](https://github.com/augiefra/claude-mods), which showed how much one band can say. Context Weather is written from scratch and shares no code with it.
