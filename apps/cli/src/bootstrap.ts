import { Database } from 'bun:sqlite'

import { Catalog, Helpers, Runs, Transcripts } from '@tetra/core'
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
// Used in local mode and by the dump command.
export const TABULAR_CONFIG = {
  mode: 'tabular' as const,
  tables: {
    load: {
      languageModels: { rowIdColumnName: 'id', tableId: 'languageModels' },
      messages: { rowIdColumnName: 'id', tableId: 'messages' },
      modelFavorites: { rowIdColumnName: 'id', tableId: 'modelFavorites' },
      prompts: { rowIdColumnName: 'id', tableId: 'prompts' },
      runs: { rowIdColumnName: 'id', tableId: 'runs' },
      sessionRunConfigs: { rowIdColumnName: 'id', tableId: 'sessionRunConfigs' },
      sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
      steps: { rowIdColumnName: 'id', tableId: 'steps' },
      streamingMessageParts: { rowIdColumnName: 'id', tableId: 'streamingMessageParts' },
      threads: { rowIdColumnName: 'id', tableId: 'threads' },
    },
    save: {
      languageModels: { rowIdColumnName: 'id', tableName: 'languageModels' },
      messages: { rowIdColumnName: 'id', tableName: 'messages' },
      modelFavorites: { rowIdColumnName: 'id', tableName: 'modelFavorites' },
      prompts: { rowIdColumnName: 'id', tableName: 'prompts' },
      runs: { rowIdColumnName: 'id', tableName: 'runs' },
      sessionRunConfigs: { rowIdColumnName: 'id', tableName: 'sessionRunConfigs' },
      sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
      steps: { rowIdColumnName: 'id', tableName: 'steps' },
      streamingMessageParts: { rowIdColumnName: 'id', tableName: 'streamingMessageParts' },
      threads: { rowIdColumnName: 'id', tableName: 'threads' },
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
    const context = {
      rawIndexes,
      rawStore,
      typedIndexes,
      typedStore,
    }
    const helpers = new Helpers(context)
    const transcripts = new Transcripts(context)
    const catalog = new Catalog(context)
    const runs = new Runs({
      credentials: credentialStore,
      rawStore,
      transcripts,
      typedStore,
    })

    const { cliActiveSessionId } = typedStore.values
    const workspace = {
      clearActiveSessionId(): void {
        cliActiveSessionId.set('')
      },
      getActiveSessionId(): string | undefined {
        const sessionId = rawStore.hasValue('cliActiveSessionId') ? cliActiveSessionId.get() : ''
        return sessionId.trim() === '' ? undefined : sessionId
      },
      setActiveSessionId(sessionId: string): void {
        cliActiveSessionId.set(sessionId)
      },
    }

    const sqlite = new Database('./tetra-redesign.db')
    const persister = createSqliteBunPersister(rawStore, sqlite, TABULAR_CONFIG)
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
      transcripts,
      workspace,
    }
  }

  // Sync mode owns a MergeableStore rawStore/rawIndexes pair before binding typed APIs.
  const { rawIndexes, rawStore } = createRawMergeableStore()
  const typedStore = bindStore(rawStore, tetraStoreSchema.tables, tetraStoreSchema.values)
  const typedIndexes = bindIndexes(rawIndexes, tetraIndexIds)
  const context = {
    rawIndexes,
    rawStore,
    typedIndexes,
    typedStore,
  }
  const helpers = new Helpers(context)
  const transcripts = new Transcripts(context)
  const catalog = new Catalog(context)
  const runs = new Runs({
    credentials: credentialStore,
    rawStore,
    transcripts,
    typedStore,
  })
  const { cliActiveSessionId } = typedStore.values
  const workspace = {
    clearActiveSessionId(): void {
      cliActiveSessionId.set('')
    },
    getActiveSessionId(): string | undefined {
      const sessionId = rawStore.hasValue('cliActiveSessionId') ? cliActiveSessionId.get() : ''
      return sessionId.trim() === '' ? undefined : sessionId
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
    transcripts,
    workspace,
  }
}
