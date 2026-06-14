import { expect, test } from 'bun:test'

import { bindStore } from '@tetra/tinybase-schema'

import { createRawMergeableStore, createRawStore, tetraStoreSchema } from './index.ts'

function expectTetraRawStorePair(pair: ReturnType<typeof createRawStore>): void {
  const { rawIndexes, rawStore } = pair
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)

  // Creation helpers apply the Tetra store schema before any data is loaded.
  expect(JSON.parse(rawStore.getTablesSchemaJson())).toEqual(tetraStoreSchema.tablesSchema)
  expect(JSON.parse(rawStore.getValuesSchemaJson())).toEqual(tetraStoreSchema.valuesSchema)
  expect(typedStore.values.catalogLastRefreshed.get()).toBeNull()
  expect(typedStore.values.cliActiveSessionId.get()).toBeNull()
  expect(typedStore.values.defaultRunConfig.get()).toBeNull()

  // Insert enough rows to prove consumer-visible index slices are already defined.
  typedStore.tables.messages.setRow('m1', {
    createdAt: 1,
    parentMessageId: null,
    parts: [],
    role: 'user',
    sessionId: 's1',
    updatedAt: 1,
  })
  typedStore.tables.messages.setRow('m2', {
    createdAt: 2,
    parentMessageId: 'm1',
    parts: [],
    role: 'assistant',
    sessionId: 's1',
    updatedAt: 2,
  })
  rawStore.setRow('runs', 'r1', {
    config: {},
    createdAt: 1,
    errorMessage: '',
    sessionId: 's1',
    status: 'completed',
    targetMessageId: 'm2',
    terminalAt: 1,
    updatedAt: 1,
  })
  rawStore.setRow('runs', 'r2', {
    config: {},
    createdAt: 2,
    errorMessage: '',
    sessionId: 's1',
    status: 'active',
    targetMessageId: 'm2',
    terminalAt: 0,
    updatedAt: 2,
  })
  rawStore.setRow('steps', 'st1', {
    cost: {},
    createdAt: 1,
    finishReason: 'stop',
    generationId: 'gen_1',
    messageId: 'm2',
    model: 'model-a',
    provider: 'openrouter',
    raw: {},
    runId: 'r2',
    sessionId: 's1',
    stepNumber: 2,
    usage: { input: {}, output: {} },
    warnings: [],
  })
  rawStore.setRow('steps', 'st2', {
    cost: {},
    createdAt: 2,
    finishReason: 'stop',
    generationId: 'gen_2',
    messageId: 'm2',
    model: 'model-a',
    provider: 'openrouter',
    raw: {},
    runId: 'r2',
    sessionId: 's1',
    stepNumber: 1,
    usage: { input: {}, output: {} },
    warnings: [],
  })

  expect(tetraStoreSchema.tablesSchema.sessions).not.toHaveProperty('activeThreadId')
  expect(tetraStoreSchema.tablesSchema).not.toHaveProperty('threads')
  expect(tetraStoreSchema.tablesSchema.messages).not.toHaveProperty('position')
  expect(tetraStoreSchema.tablesSchema.messages).not.toHaveProperty('threadId')
  expect(rawIndexes.getSliceRowIds('messagesBySession', 's1')).toEqual(['m1', 'm2'])
  expect(rawIndexes.getSliceRowIds('runsByTargetMessageNewestFirst', 'm2')).toEqual(['r2', 'r1'])
  expect(rawIndexes.getSliceRowIds('stepsByRun', 'r2')).toEqual(['st2', 'st1'])
}

test('createRawStore returns a schema-bound Store with Tetra indexes', () => {
  expectTetraRawStorePair(createRawStore())
})

test('createRawMergeableStore returns a schema-bound MergeableStore with Tetra indexes', () => {
  expectTetraRawStorePair(createRawMergeableStore())
})
