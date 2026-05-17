import { Database } from 'bun:sqlite'

import { createRunner, createSessions, createTetraStore } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'

// Bootstrap: wire subsystems, attach SQLite persistence
export async function bootstrap() {
  const tetraStore = createTetraStore()
  const sessions = createSessions(tetraStore)
  const runner = createRunner(tetraStore, sessions, credentialStore)
  runner.recover()

  // Persist store to SQLite — tabular mode maps each TinyBase table to a real SQL table
  const db = new Database('./tetra.db')
  const persister = createSqliteBunPersister(tetraStore.store, db, {
    mode: 'tabular',
    tables: {
      load: {
        messages: { rowIdColumnName: 'id', tableId: 'messages' },
        requests: { rowIdColumnName: 'id', tableId: 'requests' },
        sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
        steps: { rowIdColumnName: 'id', tableId: 'steps' },
      },
      save: {
        messages: { rowIdColumnName: 'id', tableName: 'messages' },
        requests: { rowIdColumnName: 'id', tableName: 'requests' },
        sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
        steps: { rowIdColumnName: 'id', tableName: 'steps' },
      },
    },
  })
  await persister.load()
  await persister.startAutoSave()

  return { runner, sessions, ...tetraStore }
}
