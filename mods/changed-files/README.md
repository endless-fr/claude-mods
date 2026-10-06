# Changed Files

A pane that lists the files Claude changed since your last message. Click a file to unfold its diff.

The list starts over each time you send a message, so it only ever shows what the reply you are reading changed. A slash command does not start it over, and neither does what reaches Claude without you typing it: a background task's notice, a scheduled prompt, another session's message. Answering Claude's questions or approving its plan keeps the list going too, since neither is a new message.

## What the pane shows

- **A header card**: how many files changed since your last message, and the lines added and removed across them. With nothing changed, it says so.
- **One tile per file**, the most recent first:
  - its source-control letter, as Cursor and VS Code mark it: **A** in green for a file Claude created, **M** in amber for one it modified, **D** in red for one it deleted, its name struck through in the Desktop app and dimmed in the terminal;
  - an icon tinted by the file's kind, its name and its folder;
  - five squares that show the share of added and removed lines, as GitHub does.
- **The diff**: click a tile and its unified diff unfolds inside it, from the file as it was before Claude first touched it in this reply to the file as it is now. Click again to fold it. A diff longer than 10,000 characters is cut where it reaches that length.

A file Claude changed and then put back exactly as it was leaves the list.

In the Desktop app the header is drawn as an image that takes the pane's width, and the tiles are dark, as in Session Recap. In the terminal the pane reads as Claude Code's own lists: a ❯ on the focused row, each file's letter, its path from the session's folder and its line counts. ↑ and ↓ move, Enter unfolds the diff under the row, Escape hands the keyboard back to the prompt.

## Using it

- In the Desktop app the pane opens by itself the first time Claude changes a file.
- In the terminal it opens by itself only once it can dock beside the transcript: in the fullscreen layout, after you ran `/changed-files` once. The mod remembers that across sessions, `/clear` and a plan approved with a fresh context included. On the main screen (`CLAUDE_CODE_NO_FLICKER=0`, tmux) a pane sits above the prompt, so there it waits for `/changed-files`.
- `/changed-files` opens the pane and gives it the keyboard, so ↑, ↓ and Enter work at once. Later, `ctrl+x tab` takes you back to it.

## Install

```bash
claude plugin marketplace add endless-fr/claude-mods
```

```bash
claude plugin install changed-files@endless-claude-mods
```

Run `/reload-plugins` in a session that is already open. Requires Claude Code v2.1.287 or later in the terminal, v2.1.286 or later in the Desktop app.

## What it reads and keeps

The mod makes no network requests, calls no model and writes no file. The only process it runs is `git`, to read the repository's state.

- **Reads**: the path each `Write`, `Edit`, `MultiEdit` and `NotebookEdit` call names, and that file's text, once before Claude's first change to it in a reply and again after each change.
- **Around each shell command Claude runs** (Claude often writes, edits and deletes files with `cat`, `sed`, `rm` or a script): the files the command names for `rm`, `unlink`, `git rm` or as the source of `mv`, the files already in the list and, in a git repository, every file `git status` lists as changed, untracked or deleted; each one's size and time before and after, and its text before. A file that git had clean takes its text before from the index (`git show :<path>`).
- **Keeps across sessions** one value: whether your terminal docks panes, as `/changed-files` last saw it.
- **Keeps**, for the session only: the text of each file before its first change in the current reply, and each file's diff. All of it is dropped when you send your next message.

## Limits

- **Claude Code's own diff panel covers this pane.** In the terminal's fullscreen layout, inside a git repository, Claude Code opens its built-in diff panel beside the transcript as soon as Claude edits a file, and while it shows, no plugin pane does: the list seems to vanish. Type `/diff` to close the built-in panel; Claude Code keeps that choice, and the list comes back. `/changed-files` says so the first time you run it in a repository.

- Outside a git repository, the shell's changes are seen only for the files already in the list and the ones a command names for removal. A file Claude creates there through the shell does not appear.
- In a repository where git lists more than 300 changed or untracked files, the mod does not read them all around each command: a file the shell creates, deletes or changes for the first time still shows, but one that was already changed before the reply and that the shell changes again shows only if it is already in the list.
- A git-ignored file (`dist/`, `node_modules/`) changed through the shell appears only if it is already in the list.
- A command left running in the background (`run_in_background`) is looked at as it starts, not as it ends.
- A file Claude created and deleted in the same reply leaves the list.
- A file changed in parallel by two tool calls at once may show only part of its diff.
- A file over 4 MiB is not followed: the mod cannot read it.

## Develop

```bash
claude plugin validate mods/changed-files
```

```bash
claude plugin test mods/changed-files
```

The diff lives in [hooks/diff.ts](hooks/diff.ts), the header card in [hooks/card.ts](hooks/card.ts) and the small drawings of a tile in [hooks/designs.ts](hooks/designs.ts), all three free of any engine call. [hooks/row.tsx](hooks/row.tsx) draws a tile's text in the Desktop app and turns a click on it into a message. [hooks/register.tsx](hooks/register.tsx) follows the file tools and draws the pane.
