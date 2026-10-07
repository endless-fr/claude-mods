import { expect, test } from 'claude-code/testing'

import { correctedOf, isWorthChecking, offerOf, probabilityOf, protectedOf } from '../hooks/correct'

test('checks sentences typed at the prompt, not commands, shell lines, single words or attachments', () => {
  expect(isWorthChecking('peux tu corigé le bug dans le planing', false)).toBe(true)
  expect(isWorthChecking('/clear', false)).toBe(false)
  expect(isWorthChecking('! git status', false)).toBe(false)
  expect(isWorthChecking('ok', false)).toBe(false)
  expect(isWorthChecking('   ', false)).toBe(false)
  expect(isWorthChecking('regarde cette capture stp', true)).toBe(false)
  expect(isWorthChecking(`voici le log ${'x'.repeat(5000)}`, false)).toBe(false)
})

test("reads Jev's probability, and nothing from a reply without one", () => {
  expect(probabilityOf('{"answers":{"has_mistakes":{"type":"noul","noul":0.91}}}')).toBe(0.91)
  expect(probabilityOf('{"answers":{}}')).toBe(null)
  expect(probabilityOf('{"answers":{"has_mistakes":{"noul":7}}}')).toBe(null)
  expect(probabilityOf('Bad gateway')).toBe(null)
})

test("reads the corrected message out of Haiku's reply", () => {
  expect(correctedOf('<message>\nPeux-tu corriger ça ?\n</message>')).toBe('Peux-tu corriger ça ?')
  expect(correctedOf('<message>a\nb</message>')).toBe('a\nb')
  expect(correctedOf('Sure! Here is the message.')).toBe(null)
})

test('protects code, paths, URLs, flags, mentions and identifiers, not the words around them', () => {
  const prompt =
    'regarde `npm run build` dans src/planning/IaPlanner.ts, la fonction getMissionDuration et TECH-045, ' +
    'lance avec --watch, cf https://docs.typesafe.ai/api.md et @Thomas. ensuite le user_id.'
  expect(protectedOf(prompt)).toEqual([
    '`npm run build`',
    'src/planning/IaPlanner.ts',
    'getMissionDuration',
    'TECH-045',
    '--watch',
    'https://docs.typesafe.ai/api.md',
    '@Thomas',
    'user_id',
  ])
  expect(protectedOf("c'est la premiere fois qu'on fait un deploy, check le planning stp")).toEqual([])
})

test('offers a correction only when it changed something, kept its length and kept every protected part', () => {
  const prompt = 'peux tu fixé le bug dans src/app.ts stp'
  expect(offerOf(prompt, 'Peux-tu fixer le bug dans src/app.ts stp')).toBe('Peux-tu fixer le bug dans src/app.ts stp')
  expect(offerOf(prompt, prompt)).toBe(null)
  expect(offerOf(prompt, null)).toBe(null)
  expect(offerOf(prompt, 'Peux-tu fixer le bug dans src/App.ts stp')).toBe(null)
  expect(offerOf(prompt, 'Fixe le bug.')).toBe(null)
  expect(offerOf(prompt, `${prompt} Voici une explication détaillée de ce que je vais faire ensuite.`)).toBe(null)
})
