# endless Claude mods

The [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) built by endless, in one marketplace.

A mod runs inside Claude Code with your permissions: it can read and write your files, start processes and make network requests. Read a mod's source, or list what it does with `claude plugin validate mods/<mod-name>`, before you install it.

## Requirements

Claude Code v2.1.287 or later in the terminal, v2.1.286 or later in the Desktop app.

## Install a mod

Add the marketplace once:

```bash
claude plugin marketplace add endless-fr/claude-mods
```

Then install any mod by name:

```bash
claude plugin install <mod-name>@endless-claude-mods
```

If a session is already open, run `/reload-plugins` in it to load the mod.

## Mods

- [changed-files](mods/changed-files): a pane that lists the files Claude changed since your last message, with each file's diff a click away.
- [context-weather](mods/context-weather): one band above the prompt that shows how full the context is, how fast you are using your 5-hour and 7-day limits, when the prompt cache lapses, what the session has cost, and which subagents are running.
- [prompt-corrector](mods/prompt-corrector): fixes the typos in your prompt before it is sent and puts the corrected version back in the prompt box, for you to send or edit. Code, paths, URLs and identifiers stay as typed. Jev picks the prompts with mistakes, Claude Haiku corrects them.
- [session-recap](mods/session-recap): when you `/clear` a conversation, a pane opens with a recap of it as a card to share: time worked, turns, tool calls, files and lines changed, test runs and cost.

## Add a mod

Each mod is a complete plugin in its own folder under `mods/`:

```text
mods/<mod-name>/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── register.tsx
├── tests/
│   └── <mod-name>.test.ts
└── README.md
```

1. Create the folder. The `name` in `plugin.json` must match the folder name.
2. Add an entry to the `plugins` array in `.claude-plugin/marketplace.json`, with the same `name`:

   ```json
   {
     "name": "<mod-name>",
     "source": "./mods/<mod-name>",
     "description": "<one line>"
   }
   ```

3. Add the mod to the list above.
4. Check the mod and the marketplace:

   ```bash
   claude plugin validate mods/<mod-name>
   claude plugin test mods/<mod-name>
   claude plugin validate .
   ```

To try a mod before it is merged, load its folder for one session:

```bash
claude --plugin-dir mods/<mod-name>
```

This repository is public. Keep secrets, internal URLs and customer data out of mods, tests and commit messages.

## License

[MIT](LICENSE)
