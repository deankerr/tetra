import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes } from 'tinybase/indexes/with-schemas'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import { tablesSchema, valuesSchema } from '@/lib/core/data/schemas'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
export const reactCoreStore = UiReact as unknown as UiReact.WithSchemas<Schemas>

export const CORE = 'core' as const

export type AppStore = MergeableStore<Schemas>
export type AppIndexes = Indexes<Schemas>

export const createAppStore = (): AppStore =>
  createMergeableStore().setSchema(tablesSchema, valuesSchema)

export async function createAppPersister(store: AppStore) {
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle('tetra-core.json', { create: true })
  return createOpfsPersister(store, handle)
}

export const createAppIndexes = (store: AppStore): AppIndexes =>
  createIndexes(store)
    .setIndexDefinition(
      'sessionsByRecency',
      'sessions',
      () => 'all',
      (_, rowId) => store.getCell('sessions', rowId, 'updatedAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition(
      'messagesBySession',
      'messages',
      'sessionId',
      'seq',
      undefined,
      (left, right) => Number(left) - Number(right),
    )
    .setIndexDefinition(
      'requestsBySession',
      'requests',
      'sessionId',
      'createdAt',
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition('requestByAssistantMessage', 'requests', 'assistantMessageId')
