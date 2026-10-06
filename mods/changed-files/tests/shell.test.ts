import { expect, test } from 'claude-code/testing'

import { dirtyIn, removalsOf } from '../hooks/shell'

test('reads the paths a command removes', () => {
  expect(removalsOf('rm -rf build "my file.txt" && git rm -q src/a.ts; mv old.ts new.ts | cat', '/p')).toEqual([
    '/p/build',
    '/p/my file.txt',
    '/p/src/a.ts',
    '/p/old.ts',
  ])
  expect(removalsOf('rm *.log ../x', '/p/sub')).toEqual(['/p/x'])
  expect(removalsOf('echo rm a', '/p')).toEqual([])
})

test("reads git's changed, untracked, deleted and renamed-away files", () => {
  const status = ' D a.ts\0D  b.ts\0 M c.ts\0?? d/e.ts\0R  new.ts\0old.ts\0'
  expect([...dirtyIn(status, '/repo')]).toEqual([
    ['/repo/a.ts', ' D'],
    ['/repo/b.ts', 'D '],
    ['/repo/c.ts', ' M'],
    ['/repo/d/e.ts', '??'],
    ['/repo/new.ts', 'R '],
    ['/repo/old.ts', ' D'],
  ])
})
