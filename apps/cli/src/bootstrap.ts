import { Database } from 'bun:sqlite'

import { Catalog, Helpers, Runs } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { setTetraIndexDefinitions, tetraStoreSchema, tetraIndexIds } from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

// oxlint-disable-next-line dot-notation -- env var name has underscores, bracket notation is clearer
export const WORKER_URL = process.env['TETRA_WORKER_URL'] ?? 'ws://localhost:8787'

// Tabular persister config — maps each TinyBase table to a SQL table with an 'id' row key column.
// Used in local mode and by the dump command.
export const TABULAR_CONFIG = {
  mode: 'tabular' as const,
  tables: {
    load: {
      languageModels: { rowIdColumnName: 'id', tableId: 'languageModels' },
      messageGenerations: { rowIdColumnName: 'id', tableId: 'messageGenerations' },
      messages: { rowIdColumnName: 'id', tableId: 'messages' },
      prompts: { rowIdColumnName: 'id', tableId: 'prompts' },
      requests: { rowIdColumnName: 'id', tableId: 'requests' },
      sessionConfigs: { rowIdColumnName: 'id', tableId: 'sessionConfigs' },
      sessionSummaries: { rowIdColumnName: 'id', tableId: 'sessionSummaries' },
      sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
    },
    save: {
      languageModels: { rowIdColumnName: 'id', tableName: 'languageModels' },
      messageGenerations: { rowIdColumnName: 'id', tableName: 'messageGenerations' },
      messages: { rowIdColumnName: 'id', tableName: 'messages' },
      prompts: { rowIdColumnName: 'id', tableName: 'prompts' },
      requests: { rowIdColumnName: 'id', tableName: 'requests' },
      sessionConfigs: { rowIdColumnName: 'id', tableName: 'sessionConfigs' },
      sessionSummaries: { rowIdColumnName: 'id', tableName: 'sessionSummaries' },
      sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
    },
  },
  values: { load: true, save: true },
}

export type BootstrapMode = 'local' | 'sync'

export async function bootstrap(mode: BootstrapMode) {
  if (mode === 'local') {
    // Local mode owns a plain Store and applies Tetra's schema directly.
    const store = createStore().setSchema(
      structuredClone(tetraStoreSchema.tablesSchema),
      structuredClone(tetraStoreSchema.valuesSchema),
    )
    const indexes = createIndexes(store)
    setTetraIndexDefinitions(indexes)
    const typedStore = bindStore(store, tetraStoreSchema.tables, tetraStoreSchema.values)
    const typedIndexes = bindIndexes(indexes, tetraIndexIds)
    const context = {
      rawIndexes: indexes,
      rawStore: store,
      typedIndexes,
      typedStore,
    }
    const helpers = new Helpers(context)
    const catalog = new Catalog(context)
    const runs = new Runs(helpers, credentialStore)

    const { cliActiveSessionId } = typedStore.values
    const workspace = {
      clearActiveSessionId(): void {
        cliActiveSessionId.set('')
      },
      getActiveSessionId(): string | undefined {
        const sessionId = store.hasValue('cliActiveSessionId') ? cliActiveSessionId.get() : ''
        return sessionId.trim() === '' ? undefined : sessionId
      },
      setActiveSessionId(sessionId: string): void {
        cliActiveSessionId.set(sessionId)
      },
    }

    const sqlite = new Database('./tetra-redesign.db')
    const persister = createSqliteBunPersister(store, sqlite, TABULAR_CONFIG)
    await persister.load()
    runs.recover()

    return {
      catalog,
      close: async () => {
        await persister.save()
        await persister.destroy()
        sqlite.close()
      },
      helpers,
      runs,
      workspace,
    }
  }

  // Sync mode owns a MergeableStore and connects it to the DO plus a local JSON SQLite cache.
  const store = createMergeableStore().setSchema(
    structuredClone(tetraStoreSchema.tablesSchema),
    structuredClone(tetraStoreSchema.valuesSchema),
  )
  const indexes = createIndexes(store)
  setTetraIndexDefinitions(indexes)
  const typedStore = bindStore(store, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(indexes, tetraIndexIds)
  const context = {
    rawIndexes: indexes,
    rawStore: store,
    typedIndexes,
    typedStore,
  }
  const helpers = new Helpers(context)
  const catalog = new Catalog(context)
  const runs = new Runs(helpers, credentialStore)
  const { cliActiveSessionId } = typedStore.values
  const workspace = {
    clearActiveSessionId(): void {
      cliActiveSessionId.set('')
    },
    getActiveSessionId(): string | undefined {
      const sessionId = store.hasValue('cliActiveSessionId') ? cliActiveSessionId.get() : ''
      return sessionId.trim() === '' ? undefined : sessionId
    },
    setActiveSessionId(sessionId: string): void {
      cliActiveSessionId.set(sessionId)
    },
  }
  const sqlite = new Database('./tetra-sync-cache.db')
  const persister = createSqliteBunPersister(store, sqlite)
  const ws = new WebSocket(`${WORKER_URL}/tetra`)
  const synchronizer = await createWsSynchronizer(store, ws)

  await persister.load()
  await synchronizer.startSync()
  runs.recover()

  return {
    catalog,
    close: async () => {
      await persister.save()
      await persister.destroy()
      await synchronizer.destroy()
      sqlite.close()
    },
    helpers,
    runs,
    workspace,
  }
}
