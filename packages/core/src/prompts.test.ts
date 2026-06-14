import { expect, test } from 'bun:test'

import { createRawStore, tetraIndexIds, tetraStoreSchema } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'

import { Prompts } from './prompts.ts'
import { RunConfigs } from './run-configs.ts'
import { Transcripts } from './transcripts/index.ts'

function createPromptHarness() {
  // Tests bind the same raw TinyBase objects used by app composition roots.
  const { rawIndexes, rawStore } = createRawStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)
  const runConfigs = new RunConfigs({ typedStore })
  const prompts = new Prompts({ runConfigs, typedStore })

  return { prompts, rawStore, runConfigs, typedIndexes, typedStore }
}

test('createPrompt stores a prompt row with defaults and provided fields', () => {
  const { prompts, typedStore } = createPromptHarness()

  // Defaults produce an empty prompt record.
  const emptyId = prompts.createPrompt()
  expect(typedStore.tables.prompts.requireEntity(emptyId)).toMatchObject({
    content: '',
    label: '',
  })

  // Provided fields land on the row as given.
  const filledId = prompts.createPrompt({ content: 'Be terse.', label: 'Terse' })
  expect(typedStore.tables.prompts.requireEntity(filledId)).toMatchObject({
    content: 'Be terse.',
    label: 'Terse',
  })
})

test('deletePrompt removes the row and unlinks it from session configs', () => {
  const { prompts, runConfigs, typedIndexes, typedStore } = createPromptHarness()
  const transcripts = new Transcripts({ runConfigs, typedIndexes, typedStore })
  const promptId = prompts.createPrompt({ content: 'Be terse.' })

  // One session references the prompt, another references a different prompt.
  const linkedSessionId = transcripts.createSession({ config: { systemPromptId: promptId } })
  const unrelatedSessionId = transcripts.createSession({ config: { systemPromptId: 'other' } })

  prompts.deletePrompt(promptId)

  // The prompt row is gone and only the linked session falls back to the '' sentinel.
  expect(typedStore.tables.prompts.hasRow(promptId)).toBe(false)
  expect(typedStore.tables.sessionRunConfigs.requireEntity(linkedSessionId).systemPromptId).toBe('')
  expect(typedStore.tables.sessionRunConfigs.requireEntity(unrelatedSessionId).systemPromptId).toBe(
    'other',
  )
})

test('deletePrompt throws on a missing prompt id', () => {
  const { prompts } = createPromptHarness()

  expect(() => {
    prompts.deletePrompt('missing')
  }).toThrow()
})

test('resolveContent returns undefined for the no-prompt sentinel', () => {
  const { prompts } = createPromptHarness()

  expect(prompts.resolveContent('')).toBeUndefined()
})

test('resolveContent returns the content of an existing prompt', () => {
  const { prompts } = createPromptHarness()
  const promptId = prompts.createPrompt({ content: 'Be terse.' })

  expect(prompts.resolveContent(promptId)).toBe('Be terse.')
})

test('resolveContent throws loudly for a missing prompt id', () => {
  const { prompts } = createPromptHarness()

  expect(() => prompts.resolveContent('missing')).toThrow('Missing row: prompts/missing')
})
