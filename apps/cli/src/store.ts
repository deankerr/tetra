import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { catalogSchema } from '@tetra/schemas/catalog'
import { librarySchema } from '@tetra/schemas/library'
import { defineSchema } from '@tetra/tinydb'
import { createDb, createMergeableDb } from '@tetra/tinydb/runtime'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { z } from 'zod'

// oxlint-disable-next-line typescript/strict-boolean-expressions -- Empty DATABASE_PATH should use the default database file.
const DATABASE_PATH = process.env.DATABASE_PATH?.trim() ?? 'tetra.db'
const CATALOG_TABLE_NAME = 'catalog'
const CLI_TABLE_NAME = 'cli'
const LIBRARY_TABLE_NAME = 'library'

const cliSchema = defineSchema({
  tables: {},
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

export type CliStores = ReturnType<typeof createInMemoryCliStores>

export function createInMemoryCliStores() {
  // The shared library stays mergeable so its shape matches the web app's synced store.
  return {
    catalog: createDb(catalogSchema),
    cli: createDb(cliSchema),
    library: createMergeableDb(librarySchema),
  }
}

export async function createCliStoreRuntime() {
  const stores = createInMemoryCliStores()
  const catalogStore = stores.catalog.raw.store
  const cliStore = stores.cli.raw.store
  const libraryStore = stores.library.raw.store

  // The CLI keeps all local stores in one SQLite database, with one JSON table per store.
  mkdirSync(dirname(DATABASE_PATH), { recursive: true })
  const db = new Database(DATABASE_PATH)
  const catalogPersister = createSqliteBunPersister(
    catalogStore,
    db,
    { mode: 'json', storeTableName: CATALOG_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('catalog'),
  )
  const cliPersister = createSqliteBunPersister(
    cliStore,
    db,
    { mode: 'json', storeTableName: CLI_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('cli'),
  )
  const libraryPersister = createSqliteBunPersister(
    libraryStore,
    db,
    { mode: 'json', storeTableName: LIBRARY_TABLE_NAME },
    undefined,
    reportIgnoredPersistenceError('library'),
  )
  await catalogPersister.load(() => catalogStore.getContent())
  await cliPersister.load(() => cliStore.getContent())
  await libraryPersister.load(() => libraryStore.getContent())

  let closed = false
  return {
    async close() {
      if (closed) {
        return
      }
      closed = true

      // Checkpoint the local cache before the process exits.
      await catalogPersister.save()
      await cliPersister.save()
      await libraryPersister.save()
    },
    stores,
  }
}

function reportIgnoredPersistenceError(table: string) {
  return (error: unknown) => {
    console.error(`[stores:${table}] ignored persistence error`, error)
  }
}
