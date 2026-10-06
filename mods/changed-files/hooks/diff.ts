/** A unified diff of two texts, line by line, free of any engine call. */

export type Diff = { source: string; added: number; removed: number }

// Past this many lines on each side of the changed middle, the middle is shown as replaced whole.
const MOST = 3000
const CONTEXT = 3
// What the Code element draws at most.
const ROOM = 10_000

type Op = { kind: ' ' | '+' | '-'; text: string; a: number; b: number }

const linesOf = (text: string | null) => (text === null || text === '' ? [] : text.replace(/\n$/, '').split('\n'))

/** The edit script between two line lists: common head and tail, then the longest common subsequence of the middle. */
function opsOf(a: string[], b: string[]): Op[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const ops: Op[] = []
  for (let i = 0; i < head; i++) ops.push({ kind: ' ', text: a[i] as string, a: i, b: i })

  const midA = a.slice(head, a.length - tail)
  const midB = b.slice(head, b.length - tail)
  if (midA.length > MOST || midB.length > MOST) {
    midA.forEach((text, i) => ops.push({ kind: '-', text, a: head + i, b: head }))
    midB.forEach((text, j) => ops.push({ kind: '+', text, a: head + midA.length, b: head + j }))
  } else {
    const n = midA.length
    const m = midB.length
    const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      const row = table[i] as Uint32Array
      const below = table[i + 1] as Uint32Array
      for (let j = m - 1; j >= 0; j--) row[j] = midA[i] === midB[j] ? (below[j + 1] as number) + 1 : Math.max(below[j] as number, row[j + 1] as number)
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ kind: ' ', text: midA[i] as string, a: head + i, b: head + j })
        i++
        j++
      } else if (j < m && (i === n || (table[i] as Uint32Array)[j + 1]! >= (table[i + 1] as Uint32Array)[j]!)) {
        ops.push({ kind: '+', text: midB[j] as string, a: head + i, b: head + j })
        j++
      } else {
        ops.push({ kind: '-', text: midA[i] as string, a: head + i, b: head + j })
        i++
      }
    }
  }

  for (let k = 0; k < tail; k++) ops.push({ kind: ' ', text: a[a.length - tail + k] as string, a: a.length - tail + k, b: b.length - tail + k })

  return ops
}

/** The diff of `before` (null for a file that did not exist) to `after`, as unified hunks cut to what the Code element draws. */
export function diffOf(before: string | null, after: string): Diff {
  const ops = opsOf(linesOf(before), linesOf(after))
  const added = ops.filter(op => op.kind === '+').length
  const removed = ops.filter(op => op.kind === '-').length

  const hunks: string[] = []
  let k = 0
  while (k < ops.length) {
    if ((ops[k] as Op).kind === ' ') {
      k++
      continue
    }
    const start = Math.max(0, k - CONTEXT)
    let end = k
    // A hunk runs on while the next change is within two contexts of the last.
    while (end < ops.length) {
      let next = end
      while (next < ops.length && (ops[next] as Op).kind !== ' ') next++
      let gap = next
      while (gap < ops.length && (ops[gap] as Op).kind === ' ') gap++
      end = next
      if (gap >= ops.length || gap - next > CONTEXT * 2) break
      end = gap
    }
    const stop = Math.min(ops.length, end + CONTEXT)
    const slice = ops.slice(start, stop)
    const first = slice[0] as Op
    const countA = slice.filter(op => op.kind !== '+').length
    const countB = slice.filter(op => op.kind !== '-').length
    const header = `@@ -${countA ? first.a + 1 : first.a},${countA} +${countB ? first.b + 1 : first.b},${countB} @@`
    hunks.push([header, ...slice.map(op => `${op.kind}${op.text.replace(/[\u0000-\u0008\u000b-\u001f]/g, '')}`)].join('\n'))
    k = stop
  }

  let source = ''
  for (const hunk of hunks) {
    if (source.length + hunk.length + 1 > ROOM) break
    source += (source ? '\n' : '') + hunk
  }

  return { source, added, removed }
}
