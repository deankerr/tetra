import { createStoreReactApi } from '@tetra/stores/react'
import {
  catalogStoreDefinition,
  libraryStoreDefinition,
  webStoreDefinition,
  WEB_CATALOG_INDEXED_DB_NAME,
  WEB_LIBRARY_INDEXED_DB_NAME,
} from '@tetra/stores/web'

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)

export async function clearTetraIndexedDbAndReload(): Promise<void> {
  if (globalThis.indexedDB === undefined) {
    globalThis.location.reload()
    return
  }

  // Both persisted browser stores are app-owned caches and can be reset together.
  await Promise.all([
    deleteIndexedDbDatabase(WEB_CATALOG_INDEXED_DB_NAME),
    deleteIndexedDbDatabase(WEB_LIBRARY_INDEXED_DB_NAME),
  ])
  globalThis.location.reload()
}

async function deleteIndexedDbDatabase(databaseName: string): Promise<undefined> {
  // Promise.withResolvers bridges the IndexedDB request API.
  const { promise, reject, resolve } = Promise.withResolvers<undefined>()
  const request = indexedDB.deleteDatabase(databaseName)

  request.addEventListener('error', () => {
    reject(new Error(`Failed to delete IndexedDB database: ${databaseName}`))
  })

  request.addEventListener('blocked', () => {
    reject(new Error(`IndexedDB database is blocked by another open tab: ${databaseName}`))
  })

  request.addEventListener('success', () => {
    resolve()
  })

  await promise
}
