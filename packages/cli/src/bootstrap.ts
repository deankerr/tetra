import { Database } from 'bun:sqlite'

import { Runs, createCoreModules, createTetraDb } from '@tetra/core-redesign'
import { credentialStore } from '@tetra/credentials'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'

// Bootstrap: wire subsystems, attach SQLite persistence
export async function bootstrap() {
  const core = createCoreModules(createTetraDb())
  const runs = new Runs(core.accessors, credentialStore)

  // CLI-only state lives in TinyBase values, but the CLI owns this convenience API.
  const workspace = {
    clearActiveSessionId(): void {
      core.db.store.setValue('cliActiveSessionId', '')
    },
    getActiveSessionId(): string | undefined {
      const sessionId = core.db.store.getValue('cliActiveSessionId')
      return sessionId.trim() === '' ? undefined : sessionId
    },
    setActiveSessionId(sessionId: string): void {
      core.db.store.setValue('cliActiveSessionId', sessionId)
    },
  }

  // Persist redesigned CLI data to a fresh SQLite file; no old-core migrations here.
  const sqlite = new Database('./tetra-redesign.db')
  const persister = createSqliteBunPersister(core.db.store, sqlite, {
    mode: 'tabular',
    tables: {
      load: {
        languageModels: { rowIdColumnName: 'id', tableId: 'languageModels' },
        messages: { rowIdColumnName: 'id', tableId: 'messages' },
        prompts: { rowIdColumnName: 'id', tableId: 'prompts' },
        requests: { rowIdColumnName: 'id', tableId: 'requests' },
        sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
      },
      save: {
        languageModels: { rowIdColumnName: 'id', tableName: 'languageModels' },
        messages: { rowIdColumnName: 'id', tableName: 'messages' },
        prompts: { rowIdColumnName: 'id', tableName: 'prompts' },
        requests: { rowIdColumnName: 'id', tableName: 'requests' },
        sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
      },
    },
    values: {
      load: true,
      save: true,
    },
  })
  await persister.load()

  runs.recover()

  return {
    ...core,
    indexes: core.db.indexes,
    persister,
    runs,
    sqlite,
    store: core.db.store,
    workspace,
  }
}
