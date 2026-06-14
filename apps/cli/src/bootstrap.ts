import { Database } from 'bun:sqlite'

import { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import {
  createRawMergeableStore,
  createRawStore,
  tetraStoreSchema,
  tetraIndexIds,
} from '@tetra/store-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

// oxlint-disable-next-line dot-notation -- env var name has underscores, bracket notation is clearer
export const WORKER_URL = process.env['TETRA_WORKER_URL'] ?? 'ws://localhost:8787'
export const SYNC_URL = `${WORKER_URL}/tetra`

// Tabular persister config — maps each TinyBase table to a SQL table with an 'id' row key column.
// Used by local mode for the tetra-redesign.db SQLite store.
export const TABULAR_CONFIG = {
  mode: 'tabular' as const,
  tables: {
    load: {
      draftSessions: { rowIdColumnName: 'id', tableId: 'draftSessions' },
      languageModels: { rowIdColumnName: 'id', tableId: 'languageModels' },
      messages: { rowIdColumnName: 'id', tableId: 'messages' },
      modelFavorites: { rowIdColumnName: 'id', tableId: 'modelFavorites' },
      prompts: { rowIdColumnName: 'id', tableId: 'prompts' },
      runs: { rowIdColumnName: 'id', tableId: 'runs' },
      sessionRunConfigs: { rowIdColumnName: 'id', tableId: 'sessionRunConfigs' },
      sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
      steps: { rowIdColumnName: 'id', tableId: 'steps' },
    },
    save: {
      draftSessions: { rowIdColumnName: 'id', tableName: 'draftSessions' },
      languageModels: { rowIdColumnName: 'id', tableName: 'languageModels' },
      messages: { rowIdColumnName: 'id', tableName: 'messages' },
      modelFavorites: { rowIdColumnName: 'id', tableName: 'modelFavorites' },
      prompts: { rowIdColumnName: 'id', tableName: 'prompts' },
      runs: { rowIdColumnName: 'id', tableName: 'runs' },
      sessionRunConfigs: { rowIdColumnName: 'id', tableName: 'sessionRunConfigs' },
      sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
      steps: { rowIdColumnName: 'id', tableName: 'steps' },
    },
  },
  values: { load: true, save: true },
}

export type BootstrapMode = 'local' | 'sync'

export async function bootstrap(mode: BootstrapMode) {
  if (mode === 'local') {
    // Local mode owns a plain rawStore/rawIndexes pair before binding typed APIs.
    const { rawIndexes, rawStore } = createRawStore()
    const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
    const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)

    // RunConfigs comes first so Prompts can delegate prompt unlinking to it.
    const runConfigs = new RunConfigs({ typedStore })
    const prompts = new Prompts({ runConfigs, typedStore })
    const transcripts = new Transcripts({ runConfigs, typedIndexes, typedStore })
    const catalog = new Catalog({ typedStore })
    const runs = new Runs({
      credentials: credentialStore,
      prompts,
      runConfigs,
      transcripts,
      typedStore,
    })

    const { cliActiveSessionId } = typedStore.values
    const workspace = {
      clearActiveSessionId(): void {
        cliActiveSessionId.set(null)
      },
      getActiveSessionId(): string | undefined {
        const sessionId = cliActiveSessionId.get()
        return sessionId === null || sessionId.trim() === '' ? undefined : sessionId
      },
      setActiveSessionId(sessionId: string): void {
        cliActiveSessionId.set(sessionId)
      },
    }

    const sqlite = new Database('./tetra-redesign.db')
    const persister = createSqliteBunPersister(rawStore, sqlite, TABULAR_CONFIG)
    await persister.load()

    return {
      catalog,
      close: async () => {
        await persister.save()
        await persister.destroy()
        sqlite.close()
      },
      prompts,
      runConfigs,
      runs,
      transcripts,
      typedStore,
      workspace,
    }
  }

  // Sync mode owns a MergeableStore rawStore/rawIndexes pair before binding typed APIs.
  const { rawIndexes, rawStore } = createRawMergeableStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)

  // RunConfigs comes first so Prompts can delegate prompt unlinking to it.
  const runConfigs = new RunConfigs({ typedStore })
  const prompts = new Prompts({ runConfigs, typedStore })
  const transcripts = new Transcripts({ runConfigs, typedIndexes, typedStore })
  const catalog = new Catalog({ typedStore })
  const runs = new Runs({
    credentials: credentialStore,
    prompts,
    runConfigs,
    transcripts,
    typedStore,
  })
  const { cliActiveSessionId } = typedStore.values
  const workspace = {
    clearActiveSessionId(): void {
      cliActiveSessionId.set(null)
    },
    getActiveSessionId(): string | undefined {
      const sessionId = cliActiveSessionId.get()
      return sessionId === null || sessionId.trim() === '' ? undefined : sessionId
    },
    setActiveSessionId(sessionId: string): void {
      cliActiveSessionId.set(sessionId)
    },
  }
  const sqlite = new Database('./tetra-sync-cache.db')
  const persister = createSqliteBunPersister(rawStore, sqlite)
  console.log(`Sync URL: ${SYNC_URL}`)
  const ws = new WebSocket(SYNC_URL)
  const synchronizer = await createWsSynchronizer(rawStore, ws)

  await persister.load()
  await synchronizer.startSync()

  return {
    catalog,
    close: async () => {
      await persister.save()
      await persister.destroy()
      await synchronizer.destroy()
      sqlite.close()
    },
    prompts,
    runConfigs,
    runs,
    transcripts,
    typedStore,
    workspace,
  }
}
