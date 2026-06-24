import { describe, expect, test } from 'bun:test'

import { catalogStoreDefinition } from '../catalog/index.ts'
import { libraryStoreDefinition } from '../library/index.ts'
import { createStoreHost } from './definition.ts'
import { createTinyBaseProviderProps } from './react.ts'

describe('store React host', () => {
  test('exposes TinyBase provider props from store ids', () => {
    const stores = createStoreHost([libraryStoreDefinition, catalogStoreDefinition])
    const providerProps = createTinyBaseProviderProps(stores)

    expect(Object.keys(providerProps.storesById).toSorted()).toEqual(['catalog', 'library'])
    expect(Object.keys(providerProps.indexesById).toSorted()).toEqual([
      'catalogIndexes',
      'libraryIndexes',
    ])
  })
})
