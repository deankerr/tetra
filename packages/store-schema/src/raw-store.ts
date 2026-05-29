import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore as createTinyBaseMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore as createTinyBaseStore } from 'tinybase/store/with-schemas'

import type { TetraRawIndexes, TetraRawStore } from './schema.ts'
import { tetraStoreSchema } from './schema.ts'

// Plain local modes ask for Tetra's rawStore/rawIndexes, then own persistence and typed binding.
export function createRawStore() {
  const rawStore = createTinyBaseStore().setSchema(
    structuredClone(tetraStoreSchema.tablesSchema),
    structuredClone(tetraStoreSchema.valuesSchema),
  )
  const rawIndexes = createTetraIndexes(rawStore)

  return { rawIndexes, rawStore }
}

// Sync modes ask for the same Tetra indexes on a MergeableStore, then own synchronization.
export function createRawMergeableStore() {
  const rawStore = createTinyBaseMergeableStore().setSchema(
    structuredClone(tetraStoreSchema.tablesSchema),
    structuredClone(tetraStoreSchema.valuesSchema),
  )
  const rawIndexes = createTetraIndexes(rawStore)

  return { rawIndexes, rawStore }
}

function createTetraIndexes(rawStore: TetraRawStore): TetraRawIndexes {
  // Index definitions belong to the Tetra store schema, not to app consumers.
  const rawIndexes = createIndexes(rawStore)
  applyTetraIndexDefinitions(rawIndexes)

  return rawIndexes
}

function applyTetraIndexDefinitions(rawIndexes: TetraRawIndexes): void {
  // HLC row IDs are lexicographically sortable, giving creation-time order for free.
  rawIndexes
    .setIndexDefinition('messagesBySession', 'messages', 'sessionId')
    .setIndexDefinition(
      'runsByAssistantMessageNewestFirst',
      'runs',
      'assistantMessageId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition(
      'runsBySessionNewestFirst',
      'runs',
      'sessionId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition('streamingPartsBySession', 'streamingMessageParts', 'sessionId')
    .setIndexDefinition('stepsByMessage', 'steps', 'messageId', 'createdAt')
    .setIndexDefinition('stepsByRun', 'steps', 'runId', 'stepNumber')
    .setIndexDefinition('stepsBySession', 'steps', 'sessionId', 'createdAt')
}
