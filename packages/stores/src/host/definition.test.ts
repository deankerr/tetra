import { describe, expect, test } from 'bun:test'

import { createCliStores } from '../cli.ts'
import { createWebStores } from '../web.ts'
import { createWorkerStores } from '../worker.ts'
import { createTinyBaseProviderProps, getStoreIndexesId } from './definition.ts'

describe('store hosts', () => {
  test('creates volatile CLI stores with typed APIs', () => {
    const stores = createCliStores()

    expect(Object.keys(stores).toSorted()).toEqual(['catalog', 'cli', 'library'])
    expect(stores.library.isMergeable).toBe(false)

    stores.cli.typedStore.values.activeSessionId.set('sess_1')
    expect(stores.cli.typedStore.values.activeSessionId.get()).toBe('sess_1')
  })

  test('exposes TinyBase provider props from store ids', () => {
    const stores = createCliStores()
    const providerProps = createTinyBaseProviderProps(stores)

    expect(Object.keys(providerProps.storesById).toSorted()).toEqual(['catalog', 'cli', 'library'])
    expect(Object.keys(providerProps.indexesById).toSorted()).toEqual([
      'catalogIndexes',
      'cliIndexes',
      'libraryIndexes',
    ])
    expect(getStoreIndexesId('library')).toBe('libraryIndexes')
  })

  test('creates the volatile web store set', () => {
    const stores = createWebStores()

    expect(Object.keys(stores).toSorted()).toEqual(['catalog', 'library', 'web'])
    expect(stores.library.isMergeable).toBe(false)
    expect(stores.web.typedStore.values.settingsOpen.get()).toBe(false)
  })

  test('creates a mergeable Worker library store', () => {
    const stores = createWorkerStores()

    expect(Object.keys(stores)).toEqual(['library'])
    expect(stores.library.isMergeable).toBe(true)
  })
})
