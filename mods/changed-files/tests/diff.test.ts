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

test('a hunk longer than the Code element takes is cut, not dropped', () => {
  const big = Array.from({ length: 4000 }, (_, i) => `line ${i} ${'y'.repeat(60)}`).join('\n')
  const { source, added } = diffOf(null, big)
  expect(added).toBe(4000)
  expect(source.length).toBeGreaterThan(5000)
  expect(source.length).toBeLessThanOrEqual(10_000)
  const header = source.split('\n')[0] as string
  const kept = source.split('\n').length - 1
  expect(header).toBe(`@@ -0,0 +1,${kept} @@`)
})

test('a replaced line shows its old text first, as git does', () => {
  const before = '{\n  "debug": true,\n  "port": 3000\n}\n'
  const after = '{\n  "debug": false,\n  "port": 3000,\n  "env": "test"\n}\n'
  const { source, added, removed } = diffOf(before, after)
  expect([added, removed]).toEqual([3, 2])
  expect(source.split('\n').slice(1, 7)).toEqual([
    ' {',
    '-  "debug": true,',
    '-  "port": 3000',
    '+  "debug": false,',
    '+  "port": 3000,',
    '+  "env": "test"',
  ])
})
