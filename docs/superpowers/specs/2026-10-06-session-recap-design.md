# Session Recap: design

Date: 2026-10-06
Status: implemented in `mods/session-recap`. Tried by hand in the Desktop app: the pane from `/session-recap` and `Copy image`. Still to be tried: the pane on `/clear` and `Save image`

## Purpose

When a conversation is cleared, show a recap of it as a card worth posting.
The card is for sharing (Slack, X), so it must look designed for an audience:
the bar is "Apple would have made this". The reference is
[session-wrapped](https://github.com/OneWave-AI/claude-code-mods/tree/main/session-wrapped),
which shows its recap only on a typed command and draws it in a bitmap font.

Decisions taken with the owner:

| Question | Decision |
| --- | --- |
| Trigger | `/clear` only. Quit, archive and close are out for now. |
| Surface | Desktop app first. The terminal gets a plain fallback. |
| Purpose | A card to share. |
| Allowed on the card | Activity numbers, cost and tokens, project name, model and tools. Never file names or paths. |
| Look | Bento: black card of rounded tiles, one large tile, one accent tile. |
| Arrival | A pane opens by itself after `/clear`. |
| Sharing | `Copy image` and `Save image` buttons. Nothing is written unless pressed. |
| Headline | Time worked. |
| Name | Session Recap (`session-recap`). |
| Credit | "Session Recap by endless · Claude Code". |

## Scope

In:

- A new mod `mods/session-recap`, listed in `.claude-plugin/marketplace.json`
  and the root `README.md`.
- Counting a conversation's activity while it runs.
- The pane with the animated card, opened on `/clear`.
- A `/session-recap` command (`/recap` is a built-in, and the engine refuses a
  built-in's name): shows the running conversation so far, or the last card
  again while the new conversation has had no turn.
- PNG export on macOS: copy to the clipboard, save to a folder.

Out:

- A recap when the session really ends (quit, archive, resume, logout).
- A designed terminal recap. The terminal pane lists the same numbers as text.
- Week and month totals, a history of past recaps.
- A model-written title. The mod makes no model call and no network request.
- Export on Windows and Linux. A press there says the image needs macOS.

## Behaviour

### Counting

A conversation runs from the session's start, or the last `/clear`, to the
next `/clear`. The mod keeps one `Stats` value for it and resets it on clear.

| Stat | Source |
| --- | --- |
| Time worked | Sum over main-thread turns of `turn.complete` time minus `turn.start` time. Not wall-clock: a session left open overnight must not read "14h". |
| Turns | Main-thread `turn.complete` count (`agentId` undefined). |
| Tool calls | `tool.call` results that were not denied, main thread and subagents. |
| Most-used tool | The tool with the highest count; ties broken by name. An MCP tool is shown by its own short name, not its `mcp__server__` prefix. |
| Files edited | Distinct `file_path` / `notebook_path` of `Edit`, `Write`, `MultiEdit`, `NotebookEdit`. Only the count is kept for display; paths never leave `Stats`. |
| Lines added, removed | From the edit's input: `Edit` counts lines of `new_string` against `old_string`; `Write` counts lines of `content` as added. An estimate, labelled as lines, not a diff. |
| Test runs | `Bash` commands matching a test-runner pattern: vitest, jest, mocha, pytest, rspec, phpunit, `playwright test`, `go test`, `cargo test`, `bun test`, `deno test`, `npm`/`pnpm`/`yarn test`, `claude plugin test`. |
| Subagents | `Agent` tool calls that were not denied. |
| Skills, connectors | Distinct `Skill` names; distinct MCP server names from tool names. |
| Cost | `$.session.usage().cost.usd` now minus its value when the conversation began. The engine's cost runs across `/clear`, so a baseline is kept. Absent where the host keeps no ledger: the tile is then replaced. |
| Tokens | Sum of input, output and cache tokens from the main thread's `turn.step` usage. |
| Model | `$.session.model()` at freeze, shown as "Opus 5.5". |
| Project | The last segment of `$.session.cwd()`. |
| Date | `$.clock.now()` at freeze, in local time, written "6 Oct 2026". |

`Stats` lives in `$.state` so a hot reload or a worker respawn does not lose
the conversation's counts.

### On `/clear`

`session.end` fires with `reason: 'clear'`. The hook:

1. Freezes a `Recap` from `Stats` (plus cost delta, model, project, date).
2. Resets `Stats` and records the new cost baseline.
3. Calls `next(e)`.
4. If the frozen conversation had at least one completed turn, opens the pane
   `session-recap` with `focus`, `closeOnEscape` and `holdToasts`.

Any other `reason` passes through untouched. A conversation with no completed
turn produces no pane.

`session.end` shares one 1.5 s bound across every hook. Steps 1 and 2 are
state writes and three reads of the session. A pane opened from `session.end`
is unasked for, which a terminal narrower than 144 columns leaves undrawn, so
the mod also hooks `command.run` for `clear` and opens the pane again once
the typed command has run: asked for, it is seated at any width. Whether the
pane shows on `/clear` in the Desktop app is still to be tried by hand.

### The pane

On `desktop`:

- The card as one `Svg`, drawn as an image so it takes the pane's width.
  Tried in the app: `isInteractive` draws a frame 150 px tall whatever the
  markup's size, and an image runs SMIL animation as well. The animation:
  tiles fade and rise in sequence over about 1.2 s, the headline first.
- Under it, two `Button`s: `Copy image`, `Save image`. After a press the
  button's row shows the outcome ("Copied", "Saved to Pictures", or what went
  wrong in one sentence).
- The mod cannot tell which system it runs on, so the buttons are always
  drawn on the desktop; where the tools are missing a press says the image
  needs macOS.

On `terminal`, `vscode`, `mobile`: a column of `Text` rows with the same
numbers. No export. This is a fallback so the mod never breaks, not a design.

`/session-recap` opens the same pane. Once the running conversation has a completed
turn it shows that, labelled "So far"; before that it shows the last frozen
`Recap`; with neither it says there is nothing to recap yet.

### The card

16:9, drawn at 1200 × 675 and exported at 2400 × 1350. Black ground, tiles
`#1C1C1E` with 28 px corners, 12 px gutters. Type is the system face
(San Francisco), semibold for numbers, tight tracking on large sizes. One
accent colour, system blue `#0A84FF`; green and red only for lines added and
removed.

Grid of three columns and three rows:

| Tile | Position | Content |
| --- | --- | --- |
| Headline | Column 1, rows 1 to 2 | Project name and date on top; time worked large; "23 turns on Opus 5.5" beneath |
| Accent | Column 2, row 1 | Tool calls, on blue |
| Small | Remaining five cells | Chosen from the priority list below |
| Credit | Column 1, row 3 | "Session Recap by endless · Claude Code" |

Small tiles, in priority order, skipping any whose value is zero or absent,
taking the first five:

1. Files edited
2. Lines (+added −removed)
3. Most used (tool name)
4. Test runs
5. Cost, with tokens beneath ("2.1M tokens")
6. Subagents
7. Skills
8. Connectors
9. Tokens (when cost is absent)

Small tiles fill the cells in this order: column 3 row 1, column 2 row 2,
column 3 row 2, column 2 row 3, column 3 row 3. No tile ever shows a zero, so
with fewer than five the layout closes up:

- Four: the credit tile spans columns 1 and 2 of row 3.
- Three: the credit tile spans all of row 3.
- Two: as three, and the second tile spans both cells of row 2.
- One: as three, the tile spans both cells of row 2, and the accent tile
  spans columns 2 and 3 of row 1.

The accent tile shows tool calls. In a conversation with none it shows
tokens instead, and tokens then leave the small-tile list.

Durations read "1h 42m", "14m", "45s". Counts above 9,999 read "12.4K".

### Export

Run only on a button press, macOS only:

1. Write the static SVG (no animation) to a temporary file, the card centred
   on a square black canvas, because Quick Look's thumbnail is square.
2. Rasterise with `qlmanage -t -s 2400` (Quick Look renders the system
   face), then crop the square to 2400 × 1350 with `sips`.
3. `Copy image`: put the PNG on the clipboard with `osascript`.
   `Save image`: move it to `~/Pictures/Session Recaps/<project>-<date>-<time>.png`
   and reveal it with `open -R`.

Verified on macOS 27: `qlmanage` draws San Francisco at semibold, the crop
gives an exact 2400 × 1350 frame, and the whole draw takes under half a
second. `sips` alone falls back to Helvetica at regular weight, so it is not
used to draw. In the app `Copy image` ran and reported the image copied.

A failed step reports one sentence in the pane and leaves no partial file.

## Structure

```text
mods/session-recap/
├── .claude-plugin/plugin.json
├── hooks/
│   ├── hooks.json
│   ├── register.tsx   hooks, the command, the pane; runs export's commands
│   ├── stats.ts       the reducers, Recap, tile selection, formatting (pure)
│   ├── card.ts        Recap to SVG, animated or static (pure)
│   └── export.ts      the commands that draw, copy and save the image (pure)
├── tests/
│   ├── stats.test.ts
│   ├── card.test.ts
│   ├── recap.test.ts  the clear-then-pane flow, on terminal and desktop
│   └── world.ts
├── types/index.d.ts   the $.state contract
├── tsconfig.json
└── README.md
```

`stats.ts`, `card.ts` and `export.ts` hold no `$` and are tested as plain
functions. The engine lets `$` be used only in the hooks module itself, so
`export.ts` lays out the commands and `register.tsx` runs them.

## What the mod reaches

| Network | Processes | Files | Model calls |
| --- | --- | --- | --- |
| None | `qlmanage`, `sips`, `osascript`, `mkdir`, `cp`, `open`, `rm`, on a button press only | One temporary SVG and PNG; a PNG in `~/Pictures/Session Recaps` on `Save image` | None |

## Testing

- `stats.test.ts`: each reducer; time worked ignores subagent turns; cost is
  the delta from the baseline; a reset on clear; the MCP short name.
- Tile selection: zeros are skipped; five are taken in order; a research
  session shows no "0 files"; absent cost falls back to tokens.
- `card.test.ts`: the SVG is well formed and under 131,072 characters; it
  carries the project, the headline and the credit; it never contains a file
  path; the static form has no animation elements.
- `recap.test.ts`: `/clear` after a turn opens the pane; `/clear` with no turn
  does not; another end reason does not; the pane mounts on `terminal` and
  `desktop`; the buttons are present only on desktop; `/session-recap` shows "So far"
  before any clear.
- `claude plugin validate mods/session-recap`, `claude plugin test
  mods/session-recap`, `claude plugin validate .`, and `tsc -p`.
- By hand in the desktop app: the pane opens on `/clear`, the animation
  plays, both buttons produce a correct 2400 × 1350 PNG.
