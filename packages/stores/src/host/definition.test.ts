import { describe, expect, test } from 'bun:test'

import { catalogStoreDefinition } from '../catalog/index.ts'
import { libraryStoreDefinition } from '../library/index.ts'
import { createWorkerStores } from '../worker.ts'
import { createStoreHost } from './definition.ts'

describe('store hosts', () => {
  test('creates shared volatile stores with typed APIs', () => {
    const stores = createStoreHost([libraryStoreDefinition, catalogStoreDefinition])

    expect(Object.keys(stores).toSorted()).toEqual(['catalog', 'library'])
    expect('getMergeableContent' in stores.library.rawStore).toBe(false)

    stores.catalog.typedStore.values.lastRefreshed.set(123)
    expect(stores.catalog.typedStore.values.lastRefreshed.get()).toBe(123)
  })

  test('creates a mergeable Worker library store', () => {
    const stores = createWorkerStores()

    expect(Object.keys(stores)).toEqual(['library'])
    expect('getMergeableContent' in stores.library.rawStore).toBe(true)
  })
})
