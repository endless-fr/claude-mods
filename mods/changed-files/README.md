# Changed Files

A pane that lists the files Claude changed since your last message. Click a file to unfold its diff.

The list starts over each time you send a message, so it only ever shows what the reply you are reading changed. A slash command does not start it over.

## What the pane shows

- **A header card**: how many files changed since your last message, and the lines added and removed across them. With nothing changed, it says so.
- **One tile per file**, the most recent first:
  - its source-control letter, as Cursor and VS Code mark it: **A** in green for a file Claude created, **M** in amber for one it modified;
  - an icon tinted by the file's kind, its name and its folder;
  - five squares that show the share of added and removed lines, as GitHub does.
- **The diff**: click a tile and its unified diff unfolds inside it, from the file as it was before Claude first touched it in this reply to the file as it is now. Click again to fold it. A diff longer than 10,000 characters is cut at the last hunk that fits.

A file Claude changed and then put back exactly as it was leaves the list.

In the Desktop app the header is drawn as an image that takes the pane's width, and the tiles are dark, as in Session Recap. In the terminal the pane lists the same files as text, each with a **Diff** button.

## Using it

- The pane opens by itself the first time Claude changes a file.
- `/changed-files` opens it again after you closed it.

## Install

```bash
claude plugin marketplace add endless-fr/claude-mods
```

```bash
claude plugin install changed-files@endless-claude-mods
```

Run `/reload-plugins` in a session that is already open. Requires Claude Code v2.1.287 or later in the terminal, v2.1.286 or later in the Desktop app.

## What it reads and keeps

The mod makes no network requests, calls no model, runs no process and writes no file.

- **Reads**: the path each `Write`, `Edit`, `MultiEdit` and `NotebookEdit` call names, and that file's text, once before Claude's first change to it in a reply and again after each change.
- **Keeps**, for the session only: the text of each file before its first change in the current reply, and each file's diff. All of it is dropped when you send your next message.

## Limits

- Only the file tools are followed. A file Claude changes through a shell command (`sed`, `mv`, `rm`, a script) does not appear.
- A file changed in parallel by two tool calls at once may show only part of its diff.

## Develop

```bash
claude plugin validate mods/changed-files
```

```bash
claude plugin test mods/changed-files
```

The diff lives in [hooks/diff.ts](hooks/diff.ts), the header card in [hooks/card.ts](hooks/card.ts) and the small drawings of a tile in [hooks/designs.ts](hooks/designs.ts), all three free of any engine call. [hooks/row.tsx](hooks/row.tsx) draws a tile's text in the Desktop app and turns a click on it into a message. [hooks/register.tsx](hooks/register.tsx) follows the file tools and draws the pane.
