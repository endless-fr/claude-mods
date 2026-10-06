import { expect, test } from 'claude-code/testing'

import { diffOf } from '../hooks/diff'

test('counts and draws added and removed lines as unified hunks', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n') + '\n'
  const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].join('\n') + '\n'
  const { source, added, removed } = diffOf(before, after)
  expect(added).toBe(2)
  expect(removed).toBe(1)
  expect(source).toContain('-d')
  expect(source).toContain('+D')
  expect(source).toContain('+k')
  expect(source.startsWith('@@ -1,')).toBe(true)
})

test('a new file is all additions, an unchanged one is no diff', () => {
  expect(diffOf(null, 'x\ny\n')).toEqual({ source: '@@ -0,0 +1,2 @@\n+x\n+y', added: 2, removed: 0 })
  expect(diffOf('same\n', 'same\n')).toEqual({ source: '', added: 0, removed: 0 })
})
