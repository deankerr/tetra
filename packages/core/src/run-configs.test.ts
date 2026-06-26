import { expect, test } from 'bun:test'

import { libraryStoreDefinition, SessionRunConfigSchema } from '@tetra/schemas/library'
import type { RunConfig } from '@tetra/schemas/library'
import { createStoreInstance } from '@tetra/tinybase-schema/runtime'

import { RunConfigs } from './run-configs.ts'

function createRunConfigHarness() {
  // Tests own the same library store instance shape used by app composition roots.
  const libraryStore = createStoreInstance(libraryStoreDefinition)
  const { rawStore, typedStore } = libraryStore
  const runConfigs = new RunConfigs({ libraryStore })

  return { rawStore, runConfigs, typedStore }
}

function createSession(
  harness: ReturnType<typeof createRunConfigHarness>,
  sessionId: string,
  partial: Partial<RunConfig> = {},
) {
  const config = harness.runConfigs.createForSession(partial)
  harness.typedStore.tables.sessions.setRow(sessionId, {
    config,
    createdAt: 0,
    title: '',
    updatedAt: 0,
  })
  return config
}

test('createForSession returns session schema defaults when nothing else is provided', () => {
  const { runConfigs } = createRunConfigHarness()
  const emptyConfig = SessionRunConfigSchema.parse({})

  const config = runConfigs.createForSession()

  expect(config).toEqual(emptyConfig)
})

test('createForSession layers stored default over schema defaults and caller partial over both', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // The stored new-session default beats schema defaults; the caller partial beats both.
  typedStore.values.defaultRunConfig.set({ maxMessages: 5, modelId: 'stored-model' })
  const config = runConfigs.createForSession({ modelId: 'caller-model' })

  expect(config).toMatchObject({
    maxMessages: 5,
    modelId: 'caller-model',
    systemPromptId: '',
  })
})

test('createForSession parses stored defaults before returning a config', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // A stored default with a wrong-typed cell must fail loudly without a partial write.
  typedStore.values.defaultRunConfig.set({ maxMessages: -1 })

  expect(() => runConfigs.createForSession()).toThrow()
  expect(typedStore.tables.sessions.getEntity('sess_1')).toBeNull()
})

test('update merges the partial over the existing session config', () => {
  const harness = createRunConfigHarness()
  const { runConfigs, typedStore } = harness

  createSession(harness, 'sess_1', { maxMessages: 5, modelId: 'first-model' })
  const config = runConfigs.update('sess_1', { systemPromptId: 'prompt-a' })

  // Untouched cells survive the merge; the partial wins where provided.
  expect(config).toMatchObject({
    maxMessages: 5,
    modelId: 'first-model',
    systemPromptId: 'prompt-a',
  })
  expect(typedStore.tables.sessions.requireEntity('sess_1').config).toMatchObject({
    maxMessages: 5,
    modelId: 'first-model',
    systemPromptId: 'prompt-a',
  })
})

test('update parses before writing, so an invalid partial lands no write', () => {
  const harness = createRunConfigHarness()
  const { runConfigs, typedStore } = harness

  createSession(harness, 'sess_1', { modelId: 'first-model' })

  // The invalid cell must fail loudly and leave the stored row untouched.
  expect(() => runConfigs.update('sess_1', { maxMessages: -1 })).toThrow()
  expect(typedStore.tables.sessions.requireEntity('sess_1').config).toMatchObject({
    maxMessages: 0,
    modelId: 'first-model',
  })
})

test('update throws when the session does not exist', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  expect(() => runConfigs.update('sess_missing', { modelId: 'model-a' })).toThrow()
  expect(typedStore.tables.sessions.getEntity('sess_missing')).toBeNull()
})

test('setAsDefault stores a session config that later createForSession calls pick up', () => {
  const harness = createRunConfigHarness()
  const { runConfigs, typedStore } = harness

  // Roundtrip: one session's config becomes the stored default for the next session.
  createSession(harness, 'sess_1', { maxMessages: 7, modelId: 'model-a' })
  runConfigs.setAsDefault('sess_1')

  expect(typedStore.values.defaultRunConfig.get()).toMatchObject({
    maxMessages: 7,
    modelId: 'model-a',
  })
  expect(runConfigs.createForSession()).toMatchObject({
    maxMessages: 7,
    modelId: 'model-a',
  })
})

test('setDefault stores a config object without requiring a session row', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  runConfigs.setDefault({
    maxMessages: 2,
    modelId: 'draft-model',
    providerOptions: {},
    systemPromptId: '',
    toolIds: [],
  })

  expect(typedStore.values.defaultRunConfig.get()).toMatchObject({
    maxMessages: 2,
    modelId: 'draft-model',
  })
  expect(runConfigs.createForSession()).toMatchObject({
    maxMessages: 2,
    modelId: 'draft-model',
  })
})

test('setAsDefault throws when the session row does not exist', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  expect(() => {
    runConfigs.setAsDefault('sess_missing')
  }).toThrow()
  expect(typedStore.values.defaultRunConfig.get()).toBeNull()
})

test('unlinkPrompt clears the prompt id only from session configs that reference it', () => {
  const harness = createRunConfigHarness()
  const { runConfigs, typedStore } = harness

  createSession(harness, 'sess_linked', { systemPromptId: 'prompt-a' })
  createSession(harness, 'sess_other', { systemPromptId: 'prompt-b' })

  runConfigs.unlinkPrompt('prompt-a')

  // Only the matching session falls back to the '' sentinel.
  expect(typedStore.tables.sessions.requireEntity('sess_linked').config.systemPromptId).toBe('')
  expect(typedStore.tables.sessions.requireEntity('sess_other').config.systemPromptId).toBe(
    'prompt-b',
  )
})

test('resolveForRun returns a complete stored session config as-is', () => {
  const harness = createRunConfigHarness()
  const { runConfigs } = harness
  const stored = {
    maxMessages: 3,
    modelId: 'model-a',
    providerOptions: { reasoning: { effort: 'high' } },
    systemPromptId: 'prompt-a',
    toolIds: ['getWeather'],
  }

  createSession(harness, 'sess_1', stored)

  expect(runConfigs.resolveForRun('sess_1')).toEqual(stored)
})

test('resolveForRun fills missing config from the session schema default', () => {
  const { rawStore, runConfigs } = createRunConfigHarness()

  // Schema defaults repair sparse raw rows while preserving session existence.
  rawStore.setRow('sessions', 'sess_1', { createdAt: 0, title: '', updatedAt: 0 })

  expect(runConfigs.resolveForRun('sess_1')).toEqual(SessionRunConfigSchema.parse({}))
})

test('resolveForRun throws when the session row does not exist', () => {
  const { runConfigs } = createRunConfigHarness()

  expect(() => runConfigs.resolveForRun('sess_missing')).toThrow(
    'Missing row: sessions/sess_missing',
  )
})

test('resolveForRun reflects later edits to the session config cell', () => {
  const harness = createRunConfigHarness()
  const { runConfigs, typedStore } = harness

  createSession(harness, 'sess_1', { modelId: 'first-model' })
  expect(runConfigs.resolveForRun('sess_1').modelId).toBe('first-model')

  // Surfaces edit the config cell in place; the next resolution sees the edit.
  typedStore.tables.sessions.setCell('sess_1', 'config', {
    ...typedStore.tables.sessions.requireEntity('sess_1').config,
    modelId: 'edited-model',
  })
  expect(runConfigs.resolveForRun('sess_1')).toMatchObject({
    maxMessages: 0,
    modelId: 'edited-model',
  })
})
