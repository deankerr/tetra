import { Database } from 'bun:sqlite'

import {
  createCatalog,
  createPrompts,
  createRunner,
  createSessions,
  createTetraStore,
} from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'

// Bootstrap: wire subsystems, attach SQLite persistence
export async function bootstrap() {
  const tetraStore = createTetraStore()
  const sessions = createSessions(tetraStore)
  const prompts = createPrompts(tetraStore)
  const runner = createRunner(tetraStore, sessions, credentialStore)
  const models = createCatalog(tetraStore)
  runner.recover()

  // Persist store to SQLite — tabular mode maps each TinyBase table to a real SQL table
  const db = new Database('./tetra.db')
  const persister = createSqliteBunPersister(tetraStore.store, db, {
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
  })
  await persister.load()
  await persister.startAutoSave()

  return { models, prompts, runner, sessions, ...tetraStore }
}
