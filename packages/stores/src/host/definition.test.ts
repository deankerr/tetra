import { describe, expect, test } from 'bun:test'

import { catalogStoreDefinition } from '../catalog/index.ts'
import { libraryStoreDefinition } from '../library/index.ts'
import { createWorkerStores } from '../worker.ts'
import { createStoreHost, createTinyBaseProviderProps, getStoreIndexesId } from './definition.ts'

describe('store hosts', () => {
  test('creates shared volatile stores with typed APIs', () => {
    const stores = createStoreHost([libraryStoreDefinition, catalogStoreDefinition])

    expect(Object.keys(stores).toSorted()).toEqual(['catalog', 'library'])
    expect(stores.library.isMergeable).toBe(false)

    stores.catalog.typedStore.values.lastRefreshed.set(123)
    expect(stores.catalog.typedStore.values.lastRefreshed.get()).toBe(123)
  })

  test('exposes TinyBase provider props from store ids', () => {
    const stores = createStoreHost([libraryStoreDefinition, catalogStoreDefinition])
    const providerProps = createTinyBaseProviderProps(stores)

    expect(Object.keys(providerProps.storesById).toSorted()).toEqual(['catalog', 'library'])
    expect(Object.keys(providerProps.indexesById).toSorted()).toEqual([
      'catalogIndexes',
      'libraryIndexes',
    ])
    expect(getStoreIndexesId('library')).toBe('libraryIndexes')
  })

  test('creates a mergeable Worker library store', () => {
    const stores = createWorkerStores()

    expect(Object.keys(stores)).toEqual(['library'])
    expect(stores.library.isMergeable).toBe(true)
  })
})
