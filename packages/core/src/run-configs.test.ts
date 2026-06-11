import { expect, test } from 'bun:test'

import { createRawStore, DEFAULT_RUN_CONFIG, tetraStoreSchema } from '@tetra/store-schema'
import { bindStore } from '@tetra/tinybase-schema'

import { RunConfigs } from './run-configs.ts'

function createRunConfigHarness() {
  // Tests bind the same raw TinyBase objects used by app composition roots.
  const { rawStore } = createRawStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const runConfigs = new RunConfigs({ rawStore, typedStore })

  return { rawStore, runConfigs, typedStore }
}

test('createForSession writes built-in defaults when nothing else is provided', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  const config = runConfigs.createForSession('sess_1')

  expect(config).toEqual(DEFAULT_RUN_CONFIG)
  expect(typedStore.tables.sessionRunConfigs.requireEntity('sess_1')).toMatchObject(
    DEFAULT_RUN_CONFIG,
  )
})

test('createForSession layers stored default over built-ins and caller partial over both', () => {
  const { runConfigs, typedStore } = createRunConfigHarness()

  // The stored new-session default beats built-ins; the caller partial beats both.
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

test('resolveForRun fills missing cells from built-in defaults', () => {
  const { rawStore, runConfigs } = createRunConfigHarness()

  // Sparse rows can exist via sync or partial writes; resolution stays tolerant.
  rawStore.setRow('sessionRunConfigs', 'sess_1', { modelId: 'model-a' })

  expect(runConfigs.resolveForRun('sess_1')).toEqual({
    ...DEFAULT_RUN_CONFIG,
    modelId: 'model-a',
  })
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
