import { Database } from 'bun:sqlite'

import { createTetraDb } from '@tetra/core'
import type { Command } from 'commander'
import type { Store } from 'tinybase'
import type { MergeableStore } from 'tinybase/mergeable-store'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'

import { TABULAR_CONFIG, WORKER_URL } from '../bootstrap'

const SYNC_SETTLE_MS = 3000

// Copy the live DO MergeableStore into a local tabular SQLite DB for SQL inspection.
// Opens both stores simultaneously — no shared state, safe to run alongside normal CLI usage.
export function registerDumpCommand(program: Command): void {
  program
    .command('dump')
    .description('Copy the live DO store into a local tabular SQLite DB')
    .option('--db <path>', 'Output SQLite file path', './tetra-redesign.db')
    .option('--settle <ms>', 'Milliseconds to wait for sync to settle', String(SYNC_SETTLE_MS))
    .action(async (opts: { db: string; settle: string }) => {
      const settleMs = Number.parseInt(opts.settle, 10)

      // Open a MergeableStore and sync from the DO.
      const syncTetraDb = createTetraDb({ mergeable: true })
      // oxlint-disable-next-line no-unsafe-type-assertion -- MergeableStore at runtime
      const mergeableStore = syncTetraDb.store as unknown as MergeableStore
      const ws = new WebSocket(`${WORKER_URL}/tetra`)
      const synchronizer = await createWsSynchronizer(mergeableStore, ws)
      await synchronizer.startSync()

      process.stdout.write(`Syncing from ${WORKER_URL} (${settleMs}ms)…`)
      await Bun.sleep(settleMs)
      console.log(' done')

      // Open a plain Store and copy the data across using the untyped store API.
      const localTetraDb = createTetraDb({ mergeable: false })
      // oxlint-disable-next-line no-unsafe-type-assertion -- raw Store API for schema-agnostic copy
      const rawLocalStore = localTetraDb.store as unknown as Store
      rawLocalStore.setTables(mergeableStore.getTables())
      rawLocalStore.setValues(mergeableStore.getValues())

      // Save to tabular SQLite.
      const sqlite = new Database(opts.db)
      // oxlint-disable-next-line no-unsafe-type-assertion -- tabular persister requires untyped Store
      const persister = createSqliteBunPersister(rawLocalStore as never, sqlite, TABULAR_CONFIG)
      await persister.save()

      const sessionCount = localTetraDb.tables.sessions.getRowIds().length
      const messageCount = localTetraDb.tables.messages.getRowIds().length
      console.log(`Dumped ${sessionCount} sessions, ${messageCount} messages → ${opts.db}`)

      await synchronizer.destroy()
      await persister.destroy()
      sqlite.close()
    })
}
