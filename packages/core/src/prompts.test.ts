import { expect, test } from 'bun:test'

import { librarySchema } from '@tetra/schemas/library'
import { createDb } from '@tetra/tinydb/runtime'

import { Prompts } from './prompts.ts'
import { RunConfigs } from './run-configs.ts'
import { Transcripts } from './transcripts/index.ts'

function createPromptHarness() {
  // Tests own the same library db used by app composition roots.
  const library = createDb(librarySchema)
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })

  return { library, prompts, runConfigs }
}

test('createPrompt stores a prompt row with defaults and provided fields', () => {
  const { prompts, library } = createPromptHarness()

  // Defaults produce an empty prompt record.
  const emptyId = prompts.createPrompt()
  expect(library.prompts.require(emptyId)).toMatchObject({
    content: '',
    label: '',
  })

  // Provided fields land on the row as given.
  const filledId = prompts.createPrompt({ content: 'Be terse.', label: 'Terse' })
  expect(library.prompts.require(filledId)).toMatchObject({
    content: 'Be terse.',
    label: 'Terse',
  })
})

test('updatePrompt updates provided fields and touches updatedAt', () => {
  const { prompts, library } = createPromptHarness()
  const originalDateNow = Date.now

  try {
    // Pin time so the prompt metadata proves updatePrompt owns updatedAt.
    Date.now = () => 10
    const promptId = prompts.createPrompt({ content: 'Be terse.', label: 'Terse' })

    Date.now = () => 20
    prompts.updatePrompt({ content: '', label: 'Blank', promptId })

    expect(library.prompts.require(promptId)).toMatchObject({
      content: '',
      createdAt: 10,
      label: 'Blank',
      updatedAt: 20,
    })
  } finally {
    Date.now = originalDateNow
  }
})

test('updatePrompt throws when no editable fields are provided', () => {
  const { prompts, library } = createPromptHarness()
  const promptId = prompts.createPrompt({ content: 'Be terse.' })
  const original = library.prompts.require(promptId)

  expect(() => {
    prompts.updatePrompt({ promptId })
  }).toThrow('No prompt fields provided')
  expect(library.prompts.require(promptId)).toEqual(original)
})

test('updatePrompt throws on a missing prompt id', () => {
  const { prompts } = createPromptHarness()

  expect(() => {
    prompts.updatePrompt({ content: 'missing', promptId: 'missing' })
  }).toThrow('Missing row: prompts/missing')
})

test('deletePrompt removes the row and unlinks it from session configs', () => {
  const { library, prompts, runConfigs } = createPromptHarness()
  const transcripts = new Transcripts({ library, runConfigs })
  const promptId = prompts.createPrompt({ content: 'Be terse.' })

  // One session references the prompt, another references a different prompt.
  const linkedSessionId = transcripts.createSession({ config: { systemPromptId: promptId } })
  const unrelatedSessionId = transcripts.createSession({ config: { systemPromptId: 'other' } })

  prompts.deletePrompt(promptId)

  // The prompt row is gone and only the linked session falls back to the '' sentinel.
  expect(library.prompts.has(promptId)).toBe(false)
  expect(library.sessions.require(linkedSessionId).config.systemPromptId).toBe('')
  expect(library.sessions.require(unrelatedSessionId).config.systemPromptId).toBe('other')
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
