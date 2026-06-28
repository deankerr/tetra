import { expect, test } from 'bun:test'

import { libraryStoreDefinition } from '@tetra/schemas/library'
import { createStoreInstance } from '@tetra/tinybase-schema/runtime'

import { Prompts } from './prompts.ts'
import { RunConfigs } from './run-configs.ts'
import { Transcripts } from './transcripts/index.ts'

function createPromptHarness() {
  // Tests own the same library store instance shape used by app composition roots.
  const libraryStore = createStoreInstance(libraryStoreDefinition)
  const { rawStore, boundIndexes, boundStore } = libraryStore
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })

  return { boundIndexes, boundStore, libraryStore, prompts, rawStore, runConfigs }
}

test('createPrompt stores a prompt row with defaults and provided fields', () => {
  const { prompts, boundStore } = createPromptHarness()

  // Defaults produce an empty prompt record.
  const emptyId = prompts.createPrompt()
  expect(boundStore.tables.prompts.requireEntity(emptyId)).toMatchObject({
    content: '',
    label: '',
  })

  // Provided fields land on the row as given.
  const filledId = prompts.createPrompt({ content: 'Be terse.', label: 'Terse' })
  expect(boundStore.tables.prompts.requireEntity(filledId)).toMatchObject({
    content: 'Be terse.',
    label: 'Terse',
  })
})

test('deletePrompt removes the row and unlinks it from session configs', () => {
  const { libraryStore, prompts, runConfigs, boundStore } = createPromptHarness()
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const promptId = prompts.createPrompt({ content: 'Be terse.' })

  // One session references the prompt, another references a different prompt.
  const linkedSessionId = transcripts.createSession({ config: { systemPromptId: promptId } })
  const unrelatedSessionId = transcripts.createSession({ config: { systemPromptId: 'other' } })

  prompts.deletePrompt(promptId)

  // The prompt row is gone and only the linked session falls back to the '' sentinel.
  expect(boundStore.tables.prompts.hasRow(promptId)).toBe(false)
  expect(boundStore.tables.sessions.requireEntity(linkedSessionId).config.systemPromptId).toBe('')
  expect(boundStore.tables.sessions.requireEntity(unrelatedSessionId).config.systemPromptId).toBe(
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
