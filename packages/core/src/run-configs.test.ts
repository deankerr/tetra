import { expect, test } from 'bun:test'

import { libraryStoreDefinition, SessionRunConfigSchema } from '@tetra/stores/library'
import { createStoreInstance } from '@tetra/tinybase-schema/runtime'

import { RunConfigs } from './run-configs.ts'

function createRunConfigHarness() {
  // Tests own the same library store instance shape used by app composition roots.
  const { rawStore, typedStore } = createStoreInstance(libraryStoreDefinition)
  const runConfigs = new RunConfigs({ typedStore })

  return { rawStore, runConfigs, typedStore }
}

test('createForSession writes session schema defaults when nothing else is provided', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()
  const emptyConfig = SessionRunConfigSchema.parse({})

  const config = runConfigs.createForSession('sess_1')

  expect(config).toEqual(emptyConfig)
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_1')).toMatchObject(emptyConfig)
})

test('createForSession layers stored default over schema defaults and caller partial over both', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // The stored new-session default beats schema defaults; the caller partial beats both.
  typedStore.values.defaultRunConfig.set({ maxMessages: 5, modelId: 'stored-model' })
  const config = runConfigs.createForSession('sess_1', { modelId: 'caller-model' })

  expect(config).toMatchObject({
    maxMessages: 5,
    modelId: 'caller-model',
    systemPromptId: '',
  })
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_1')).toMatchObject({
    maxMessages: 5,
    modelId: 'caller-model',
  })
})

test('createForSession parses before writing, so an invalid merge lands no row', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // A stored default with a wrong-typed cell must fail loudly without a partial write.
  typedStore.values.defaultRunConfig.set({ maxMessages: -1 })

  expect(() => runConfigs.createForSession('sess_1')).toThrow()
  expect(typedStore.tables.sessionRunConfigs.getEntity('sess_1')).toBeNull()
})

test('update merges the partial over the existing session config row', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.createForSession('sess_1', { maxMessages: 5, modelId: 'first-model' })
  const config = runConfigs.update('sess_1', { systemPromptId: 'prompt-a' })

  // Untouched cells survive the merge; the partial wins where provided.
  expect(config).toMatchObject({
    maxMessages: 5,
    modelId: 'first-model',
    systemPromptId: 'prompt-a',
  })
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_1')).toMatchObject({
    maxMessages: 5,
    modelId: 'first-model',
    systemPromptId: 'prompt-a',
  })
})

test('update parses before writing, so an invalid partial lands no write', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.createForSession('sess_1', { modelId: 'first-model' })

  // The invalid cell must fail loudly and leave the stored row untouched.
  expect(() => runConfigs.update('sess_1', { maxMessages: -1 })).toThrow()
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_1')).toMatchObject({
    maxMessages: 0,
    modelId: 'first-model',
  })
})

test('update throws when the session config row does not exist', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  expect(() => runConfigs.update('sess_missing', { modelId: 'model-a' })).toThrow()
  expect(typedStore.tables.sessionRunConfigs.getEntity('sess_missing')).toBeNull()
})

test('setAsDefault stores a session config that later createForSession calls pick up', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // Roundtrip: one session's config becomes the stored default for the next session.
  runConfigs.createForSession('sess_1', { maxMessages: 7, modelId: 'model-a' })
  runConfigs.setAsDefault('sess_1')

  expect(typedStore.values.defaultRunConfig.get()).toMatchObject({
    maxMessages: 7,
    modelId: 'model-a',
  })
  expect(runConfigs.createForSession('sess_2')).toMatchObject({
    maxMessages: 7,
    modelId: 'model-a',
  })
})

test('setAsDefault throws when the session config row does not exist', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  expect(() => {
    runConfigs.setAsDefault('sess_missing')
  }).toThrow()
  expect(typedStore.values.defaultRunConfig.get()).toBeNull()
})

test('unlinkPrompt clears the prompt id only from session configs that reference it', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.createForSession('sess_linked', { systemPromptId: 'prompt-a' })
  runConfigs.createForSession('sess_other', { systemPromptId: 'prompt-b' })

  runConfigs.unlinkPrompt('prompt-a')

  // Only the matching session falls back to the '' sentinel.
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_linked').systemPromptId).toBe('')
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_other').systemPromptId).toBe(
    'prompt-b',
  )
})

test('deleteForSession removes the session config row', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.createForSession('sess_1')
  runConfigs.deleteForSession('sess_1')

  expect(typedStore.tables.sessionRunConfigs.getEntity('sess_1')).toBeNull()
})

test('resolveForRun returns a complete stored row as-is', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()
  const stored = {
    maxMessages: 3,
    modelId: 'model-a',
    providerOptions: { reasoning: { effort: 'high' } },
    systemPromptId: 'prompt-a',
    toolIds: ['getWeather'],
  }

  typedStore.tables.sessionRunConfigs.setRow('sess_1', stored)

  expect(runConfigs.resolveForRun('sess_1')).toEqual(stored)
})

test('resolveForRun fills missing cells from schema defaults', () => {
  const { rawStore, runConfigs } = createRunConfigHarness()

  // Schema defaults repair sparse raw rows while preserving row existence.
  rawStore.setRow('sessionRunConfigs', 'sess_1', { modelId: 'model-a' })

  expect(runConfigs.resolveForRun('sess_1')).toEqual(
    SessionRunConfigSchema.parse({ modelId: 'model-a' }),
  )
})

test('resolveForRun throws when the session config row does not exist', () => {
  const { runConfigs } = createRunConfigHarness()

  expect(() => runConfigs.resolveForRun('sess_missing')).toThrow(
    'Missing row: sessionRunConfigs/sess_missing',
  )
})

test('resolveForRun reflects later per-cell edits to the session config row', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.createForSession('sess_1', { modelId: 'first-model' })
  expect(runConfigs.resolveForRun('sess_1').modelId).toBe('first-model')

  // Surfaces edit config cells in place; the next resolution sees the edit (ADR-0008).
  typedStore.tables.sessionRunConfigs.setCell('sess_1', 'modelId', 'edited-model')
  expect(runConfigs.resolveForRun('sess_1')).toMatchObject({
    maxMessages: 0,
    modelId: 'edited-model',
  })
})
