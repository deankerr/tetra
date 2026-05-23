import { Database } from 'bun:sqlite'

import { Runs, createCoreModules, createTetraDb } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { MergeableStore } from 'tinybase/mergeable-store'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'

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
  const core = createCoreModules(createTetraDb({ mergeable: mode === 'sync' }))
  const runs = new Runs(core.store, credentialStore)

  const cliActiveSessionId = core.db.tables.getValue('cliActiveSessionId')
  const workspace = {
    clearActiveSessionId(): void {
      cliActiveSessionId.setValue('')
    },
    getActiveSessionId(): string | undefined {
      const sessionId = cliActiveSessionId.getValue()
      return sessionId.trim() === '' ? undefined : sessionId
    },
    setActiveSessionId(sessionId: string): void {
      cliActiveSessionId.setValue(sessionId)
    },
  }

  if (mode === 'local') {
    const sqlite = new Database('./tetra-redesign.db')
    const persister = createSqliteBunPersister(core.db.store, sqlite, TABULAR_CONFIG)
    await persister.load()
    runs.recover()

    return {
      catalog: core.catalog,
      close: async () => {
        await persister.save()
        await persister.destroy()
        sqlite.close()
      },
      runs,
      store: core.store,
      workspace,
    }
  }

  // sync mode: MergeableStore connected to the DO, with a local JSON SQLite cache for offline
  // resilience. The cache file is intentionally separate from the tabular db.
  const sqlite = new Database('./tetra-sync-cache.db')
  const persister = createSqliteBunPersister(core.db.store, sqlite)
  // oxlint-disable-next-line no-unsafe-type-assertion -- store is a MergeableStore at runtime
  const mergeableStore = core.db.store as unknown as MergeableStore
  const ws = new WebSocket(`${WORKER_URL}/tetra`)
  const synchronizer = await createWsSynchronizer(mergeableStore, ws)

  await persister.load()
  await synchronizer.startSync()
  runs.recover()

  return {
    catalog: core.catalog,
    close: async () => {
      await persister.save()
      await persister.destroy()
      await synchronizer.destroy()
      sqlite.close()
    },
    runs,
    store: core.store,
    workspace,
  }
}
