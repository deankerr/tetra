export const TETRA_INDEXED_DB_NAME = 'tetra-local'

// eslint-disable-next-line require-await -- Promise.withResolvers bridges the IndexedDB request API.
async function deleteDatabase(name: string): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<undefined>()
  const request = indexedDB.deleteDatabase(name)

  request.addEventListener('error', () => {
    reject(new Error(`Failed to delete IndexedDB database: ${name}`))
  })

  request.addEventListener('blocked', () => {
    reject(new Error(`IndexedDB database is blocked by another open tab: ${name}`))
  })

  request.addEventListener('success', () => {
    resolve()
  })

  await promise
}

export async function hardEraseIndexedDb(): Promise<void> {
  if (!('indexedDB' in window)) {
    return
  }

  await deleteDatabase(TETRA_INDEXED_DB_NAME)
}

export async function hardEraseWebData(): Promise<void> {
  await hardEraseIndexedDb()
  window.location.reload()
}
