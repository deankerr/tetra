import type { librarySchema } from '@tetra/schemas/library'
import type { SchemasOf } from '@tetra/tinydb/runtime'
import { z } from 'zod'

import type { SyncConnectionStatus, SyncTransferStatus, WebStores } from '@/stores'
import { SyncConnection, buildSyncUrl } from '@/stores/sync/connection'

// Keys are generated, not typed: enough entropy that two libraries can only ever meet on a channel
// through the deliberate act of pasting a key. The worker validates the same shape.
export const SyncKeySchema = z
  .string()
  .trim()
  .regex(/^[\w-]{16,64}$/u, 'Invalid sync key')

export function generateSyncKey(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

interface ResolvedSyncConfig {
  enabled: boolean
  key: string | undefined
  workerUrl: string | undefined
}

type LibraryStore = WebStores['library']['raw']['store']
type LibrarySchemas = SchemasOf<typeof librarySchema>

// Everything the controller learns is written to the sync store, then read back reactively by
// components. Undefined fields are left untouched; null clears a nullable value.
interface SyncStatusPatch {
  lastError?: string | null | undefined
  receives?: number | undefined
  sends?: number | undefined
  status?: SyncConnectionStatus | undefined
  transfer?: SyncTransferStatus | undefined
  url?: string | null | undefined
}

// The controller is the sync runtime in the VISION.md sense: components call its commands for
// user intentions and read reactive state from the stores it writes. Consent and the channel key
// live in the prefs store (durable); connection state lives in the sync store (ephemeral).
export class SyncController {
  private activeConnection: SyncConnection<LibrarySchemas> | undefined
  private generation = 0
  private readonly library: LibraryStore
  private readonly prefs: WebStores['prefs']
  private readonly status: WebStores['sync']

  constructor(args: {
    library: LibraryStore
    prefs: WebStores['prefs']
    status: WebStores['sync']
  }) {
    this.library = args.library
    this.prefs = args.prefs
    this.status = args.status

    // Prefs changes — this tab's commands or another tab's via localStorage auto-load — both
    // funnel through the same reconcile.
    this.prefs.raw.store.addValuesListener(() => {
      void this.reconcile()
    })
    void this.reconcile()
  }

  // Commands write user intent to the prefs store; reconciliation reacts to the store change.
  setEnabled(enabled: boolean): void {
    console.log('[stores:sync] command: setEnabled', enabled)
    this.prefs.values.syncEnabled.set(enabled)
  }

  // The key names the channel this device pairs on; changing it re-dials via reconciliation.
  setKey(key: string): void {
    console.log('[stores:sync] command: setKey', key)
    this.prefs.values.syncKey.set(SyncKeySchema.parse(key))
  }

  // Manual resync is a command against the active connection, if one currently exists.
  async resync(): Promise<void> {
    const connection = this.activeConnection
    if (connection === undefined) {
      return
    }

    const stats = await connection.resync()
    if (!this.isActiveConnection(connection) || stats === undefined) {
      return
    }

    console.log('[stores:sync] resync complete', { receives: stats.receives, sends: stats.sends })
    this.writeStatus({ receives: stats.receives, sends: stats.sends, transfer: 'idle' })
  }

  // Delete-all-data closes the socket before local storage is wiped so no frames arrive mid-wipe.
  async shutdown(): Promise<void> {
    console.log('[stores:sync] shutdown')
    this.generation += 1
    await this.closeConnection()
  }

  // Reconciliation is the top-level lifecycle story: resolve config, close, or open exactly one
  // connection. Generation checks reject async completions from reconciles that config changes
  // have since superseded.
  private async reconcile(): Promise<void> {
    const config = this.resolveConfig()
    this.generation += 1
    const { generation } = this
    this.status.values.workerUrl.set(config.workerUrl ?? null)

    if (!config.enabled || config.workerUrl === undefined || config.key === undefined) {
      await this.closeConnection()
      if (generation !== this.generation) {
        return
      }

      console.log('[stores:sync] reconcile → idle', {
        status: idleStatusFor(config),
        workerUrl: config.workerUrl,
      })
      this.writeStatus({
        lastError: null,
        receives: 0,
        sends: 0,
        status: idleStatusFor(config),
        transfer: 'idle',
        url: null,
      })
      return
    }

    const url = buildSyncUrl(config.workerUrl, config.key)
    if (this.activeConnection?.url === url) {
      return
    }

    await this.closeConnection()
    if (generation !== this.generation) {
      return
    }

    await this.openConnection({ generation, url })
  }

  private async openConnection(args: { generation: number; url: string }): Promise<void> {
    console.log('[stores:sync] reconcile → connecting', { url: args.url })
    this.writeStatus({ lastError: null, status: 'connecting', transfer: 'idle', url: args.url })

    const connection = new SyncConnection<LibrarySchemas>(args.url)
    this.activeConnection = connection
    this.listenToConnection(connection)

    const didStart = await connection.start(this.library, (transfer) => {
      if (!this.isActiveConnection(connection)) {
        return
      }

      const stats = connection.getStats()
      this.writeStatus({ receives: stats?.receives, sends: stats?.sends, transfer })
    })
    if (args.generation !== this.generation || !this.isActiveConnection(connection)) {
      await connection.close()
      return
    }

    if (!didStart) {
      console.error('[stores:sync] connect failed', { url: args.url })
      this.writeStatus({ lastError: 'Remote sync connect failed', status: 'error' })
      await connection.close()
      return
    }

    const status = connection.isOpen() ? 'live' : 'reconnecting'
    console.log(`[stores:sync] connection started → ${status}`, { url: args.url })
    const stats = connection.getStats()
    this.writeStatus({
      receives: stats?.receives,
      sends: stats?.sends,
      status,
      transfer: 'idle',
    })
  }

  // Closing invalidates the active instance before cleanup so late socket events are ignored.
  private async closeConnection(): Promise<void> {
    const connection = this.activeConnection
    this.activeConnection = undefined
    if (connection === undefined) {
      return
    }

    console.log('[stores:sync] connection closed', { url: connection.url })
    await connection.close()
  }

  // Socket events are interpreted here because only the controller knows if a connection is current.
  private listenToConnection(connection: SyncConnection<LibrarySchemas>): void {
    connection.listenToSocket({
      onClose: () => {
        if (this.isActiveConnection(connection)) {
          console.log('[stores:sync] socket closed → reconnecting')
          this.writeStatus({ status: 'reconnecting', transfer: 'idle' })
        }
      },
      onError: (event) => {
        if (this.isActiveConnection(connection)) {
          const lastError = event.message ?? String(event.error ?? 'WebSocket error')
          console.error('[stores:sync] socket error → reconnecting', lastError)
          this.writeStatus({
            lastError,
            status: 'reconnecting',
            transfer: 'idle',
          })
        }
      },
      onOpen: () => {
        if (this.isActiveConnection(connection)) {
          console.log('[stores:sync] socket open → live; forcing resync')
          this.writeStatus({ lastError: null, status: 'live' })
          // Nothing in TinyBase re-converges on socket reopen; this forced resync is the one
          // mechanism that makes reconnects correct.
          void this.resync()
        }
      },
    })
  }

  private isActiveConnection(connection: SyncConnection<LibrarySchemas>): boolean {
    return !connection.isClosing() && this.activeConnection === connection
  }

  private resolveConfig(): ResolvedSyncConfig {
    return {
      enabled: this.prefs.values.syncEnabled.get(),
      key: this.prefs.values.syncKey.get() ?? undefined,
      workerUrl: this.prefs.values.syncWorkerUrl.get() ?? getEnv('VITE_SYNC_WORKER_URL'),
    }
  }

  // Undefined fields are left untouched; null clears a nullable value.
  private writeStatus(patch: SyncStatusPatch): void {
    const { values } = this.status
    this.status.batch(() => {
      if (patch.lastError !== undefined) {
        values.lastError.set(patch.lastError)
      }
      if (patch.receives !== undefined) {
        values.receives.set(patch.receives)
      }
      if (patch.sends !== undefined) {
        values.sends.set(patch.sends)
      }
      if (patch.status !== undefined) {
        values.status.set(patch.status)
      }
      if (patch.transfer !== undefined) {
        values.transfer.set(patch.transfer)
      }
      if (patch.url !== undefined) {
        values.url.set(patch.url)
      }
    })
  }
}

function idleStatusFor(config: ResolvedSyncConfig): SyncConnectionStatus {
  if (!config.enabled) {
    return 'disabled'
  }
  if (config.workerUrl === undefined || config.key === undefined) {
    return 'unconfigured'
  }

  return 'connecting'
}

function getEnv(name: string): string | undefined {
  const rawValue: unknown = import.meta.env[name]
  if (typeof rawValue !== 'string') {
    return undefined
  }

  const value = rawValue.trim()
  return value === '' ? undefined : value
}
