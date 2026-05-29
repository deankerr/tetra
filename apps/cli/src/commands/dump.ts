import { Database } from 'bun:sqlite'

import { createRawMergeableStore, createRawStore, tetraStoreSchema } from '@tetra/store-schema'
import { bindStore } from '@tetra/tinybase-schema'
import type { Command } from 'commander'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'

import { SYNC_URL, TABULAR_CONFIG } from '../bootstrap'

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

      // Open a MergeableStore rawStore and sync from the DO.
      const { rawStore: mergeableStore } = createRawMergeableStore()
      const ws = new WebSocket(SYNC_URL)
      const synchronizer = await createWsSynchronizer(mergeableStore, ws)
      await synchronizer.startSync()

      process.stdout.write(`Syncing from ${SYNC_URL} (${settleMs}ms)…`)
      await Bun.sleep(settleMs)
      console.log(' done')

      // Open a plain rawStore and copy the data across using the untyped store API.
      const { rawStore: localStore } = createRawStore()
      localStore.setTables(mergeableStore.getTables())
      localStore.setValues(mergeableStore.getValues())
      const localTypedStore = bindStore(
        localStore,
        tetraStoreSchema.tables,
        tetraStoreSchema.values,
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
