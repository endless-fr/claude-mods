/* The file rows' small drawings: a document icon tinted by the file's kind. */

export function split(path: string): { name: string; dir: string } {
  const short = path.replace(/^\/Users\/[^/]+/, '~')
  const at = short.lastIndexOf('/')
  return at < 0 ? { name: short, dir: '' } : { name: short.slice(at + 1), dir: short.slice(0, at) || '/' }
}

/** The path as Claude Code writes it: from the session's folder when inside it. */
export function relativeTo(cwd: string, path: string): string {
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`
  if (cwd !== '' && path.startsWith(base)) return path.slice(base.length)
  return split(path).dir === '' ? path : path.replace(/^\/Users\/[^/]+/, '~')
}

const SYSTEM_TINTS: Record<string, string> = {
  ts: '#0A84FF', tsx: '#0A84FF', js: '#FFD60A', jsx: '#FFD60A', json: '#8E8E93', md: '#5E5CE6',
  py: '#30D158', css: '#FF375F', html: '#FF9F0A', swift: '#FF9F0A', ipynb: '#FF9F0A',
}

function tintOf(name: string): string {
  const at = name.lastIndexOf('.')
  return (at > 0 && SYSTEM_TINTS[name.slice(at + 1).toLowerCase()]) || '#0A84FF'
}

export function iconSvg(name: string): string {
  const tint = tintOf(name)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect width="32" height="32" rx="8" fill="${tint}"/>
    <path d="M10 7 h8 l5 5 v13 a1.5 1.5 0 0 1 -1.5 1.5 h-11.5 a1.5 1.5 0 0 1 -1.5 -1.5 v-16.5 a1.5 1.5 0 0 1 1.5 -1.5 z" fill="#FFFFFF" opacity="0.95"/>
    <path d="M18 7 v5 h5" fill="none" stroke="${tint}" stroke-width="1.2" opacity="0.7"/>
  </svg>`
}

/** A Button key for a path: short, stable, no path characters. */
export function keyOf(path: string): string {
  let hash = 5381
  for (let i = 0; i < path.length; i++) hash = ((hash << 5) + hash + path.charCodeAt(i)) >>> 0
  return `file-${hash.toString(36)}`
}

/** GitHub's five squares: green for the share of added lines, red for removed, grey for the rest. */
export function barSvg(added: number, removed: number): string {
  const total = added + removed
  const greens = total === 0 ? 0 : Math.round((5 * added) / total)
  const reds = total === 0 ? 0 : Math.min(5 - greens, Math.max(removed > 0 ? 1 : 0, Math.round((5 * removed) / total)))
  const squares = Array.from({ length: 5 }, (_, i) => {
    const fill = i < greens ? '#30D158' : i < greens + reds ? '#FF453A' : '#48484A'
    return `<rect x="${i * 11}" y="0" width="9" height="9" rx="2.5" fill="${fill}"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 9" width="53" height="9">${squares}</svg>`
}

/** Cursor's (VS Code's) source-control letters and their colours: A for a file added, M for one modified. */
export function badgeOf(isNew: boolean): { letter: 'A' | 'M'; color: string; label: string } {
  return isNew ? { letter: 'A', color: '#81B88B', label: 'Ajouté' } : { letter: 'M', color: '#E2C08D', label: 'Modifié' }
}
