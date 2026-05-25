import { Database } from 'bun:sqlite'

import { tetraDbDefinition } from '@tetra/core'
import { bindTinybaseStore } from '@tetra/tinybase-schema'
import type { Command } from 'commander'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

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
      const mergeableStore = createMergeableStore().setSchema(
        structuredClone(tetraDbDefinition.tinybaseTablesSchema),
        structuredClone(tetraDbDefinition.tinybaseValuesSchema),
      )
      const ws = new WebSocket(`${WORKER_URL}/tetra`)
      const synchronizer = await createWsSynchronizer(mergeableStore, ws)
      await synchronizer.startSync()

      process.stdout.write(`Syncing from ${WORKER_URL} (${settleMs}ms)…`)
      await Bun.sleep(settleMs)
      console.log(' done')

      // Open a plain Store and copy the data across using the untyped store API.
      const localStore = createStore().setSchema(
        structuredClone(tetraDbDefinition.tinybaseTablesSchema),
        structuredClone(tetraDbDefinition.tinybaseValuesSchema),
      )
      localStore.setTables(mergeableStore.getTables())
      localStore.setValues(mergeableStore.getValues())
      const localTypedStore = bindTinybaseStore(
        localStore,
        tetraDbDefinition.tables,
        tetraDbDefinition.values,
      )

      // Save to tabular SQLite.
      const sqlite = new Database(opts.db)
      const persister = createSqliteBunPersister(localStore, sqlite, TABULAR_CONFIG)
      await persister.save()

      const sessionCount = localTypedStore.tables.sessions.getRowIds().length
      const messageCount = localTypedStore.tables.messages.getRowIds().length
      console.log(`Dumped ${sessionCount} sessions, ${messageCount} messages → ${opts.db}`)

      await synchronizer.destroy()
      await persister.destroy()
      sqlite.close()
    })
}
