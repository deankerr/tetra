import { Database } from 'bun:sqlite'

import { createRunner, createSessions, createTetraStore } from '@tetra/core'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'

// Bootstrap: resolve API key from env, wire subsystems, attach SQLite persistence
export async function bootstrap() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    console.error('Error: OPENROUTER_API_KEY is not set')
    process.exit(1)
  }

  const tetraStore = createTetraStore()
  const sessions = createSessions(tetraStore)
  const runner = createRunner(tetraStore, sessions, () => apiKey)
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
