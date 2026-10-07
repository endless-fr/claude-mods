/* What a shell command changes: Claude often writes, edits and deletes files through Bash. */

/** Splits a command line into words, quotes honoured, and its commands at `&&`, `||`, `;` and `|`. */
function commandsOf(line: string): string[][] {
  const commands: string[][] = [[]]
  let word = ''
  let hasWord = false
  let quote: '"' | "'" | null = null
  const end = () => {
    if (hasWord) commands[commands.length - 1]!.push(word)
    word = ''
    hasWord = false
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += char
    } else if (char === '"' || char === "'") {
      quote = char
      hasWord = true
    } else if (char === '\\' && i + 1 < line.length) {
      word += line[++i]
      hasWord = true
    } else if (/\s/.test(char)) {
      end()
    } else if (char === ';' || char === '|' || char === '&' || char === '\n') {
      end()
      if (commands[commands.length - 1]!.length > 0) commands.push([])
    } else {
      word += char
      hasWord = true
    }
  }
  end()

  return commands.filter(words => words.length > 0)
}

function resolve(cwd: string, path: string): string {
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }

  return `/${out.join('/')}`
}

/** Each command of the line with the folder it runs in: `cd` moves the ones after it. */
function placedOf(line: string, cwd: string): { words: string[]; dir: string }[] {
  const placed: { words: string[]; dir: string }[] = []
  let dir = cwd
  for (const words of commandsOf(line)) {
    // `cd`, `cd ~` or `cd -` lead where the line does not say: left as is.
    if (words[0] === 'cd' && words[1] !== undefined && !/^[~-]/.test(words[1]) && !/[$*?[]/.test(words[1])) dir = resolve(dir, words[1])
    placed.push({ words, dir })
  }

  return placed
}

/** The folders a command line runs in: `cwd`, then every one a `cd` names. */
export function foldersOf(line: string, cwd: string): string[] {
  return [...new Set([cwd, ...placedOf(line, cwd).map(({ dir }) => dir)])]
}

/**
 * The paths a command line names for removal: the operands of `rm`, `unlink`
 * and `git rm`, and the sources of `mv` and `git mv`, each from the folder a
 * `cd` before it leads to. A pattern (`*.log`) is left out: only the shell
 * knows what it matched.
 */
export function removalsOf(line: string, cwd: string): string[] {
  const paths: string[] = []
  for (let { words, dir } of placedOf(line, cwd)) {
    while (words[0] === 'sudo' || words[0] === 'command') words = words.slice(1)
    if (words[0] === 'git') words = words.slice(1)
    const [name, ...rest] = words
    if (name !== 'rm' && name !== 'unlink' && name !== 'mv') continue
    const operands = rest.filter(word => !word.startsWith('-'))
    const named = name === 'mv' ? operands.slice(0, -1) : operands
    for (const path of named) if (!/[*?[]/.test(path)) paths.push(resolve(dir, path))
  }

  return [...new Set(paths)]
}

/**
 * The files `git status --porcelain -z --untracked-files=all` lists, absolute
 * from the repository's root, each with its two-letter code: changed, staged,
 * untracked (`??`) or deleted. A rename lists its source as deleted.
 */
export function dirtyIn(status: string, root: string): Map<string, string> {
  const dirty = new Map<string, string>()
  const entries = status.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    dirty.set(resolve(root, entry.slice(3)), code)
    // A rename or copy names its source in the next entry.
    if (code.includes('R') || code.includes('C')) {
      if (code[0] === 'R') dirty.set(resolve(root, entries[i + 1] ?? ''), ' D')
      i++
    }
  }

  return dirty
}
