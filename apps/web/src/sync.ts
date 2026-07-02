/* eslint-disable max-classes-per-file -- Sync is easier to scan while its settings, runtime, and connection instances stay colocated. */
import { useSyncExternalStore } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
import type { ErrorEvent as ReconnectingWebSocketErrorEvent } from 'reconnecting-websocket'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { OptionalSchemas } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import type { WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import type { SynchronizerStats } from 'tinybase/synchronizers/with-schemas'
import { z } from 'zod'

const SYNC_SETTINGS_STORAGE_NAME = 'tetra:sync'
const SYNC_REQUEST_TIMEOUT_SECONDS = 5
const TINYBASE_STATUS_IDLE = 0
const TINYBASE_STATUS_LOADING = 1
const TINYBASE_STATUS_SAVING = 2

const StoredSyncSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    workerUrl: z.string().trim().min(1).optional(),
  })
  .default({ enabled: false })

type StoredSyncSettings = z.infer<typeof StoredSyncSettingsSchema>

export type SyncConnectionStatus =
  | 'connecting'
  | 'disabled'
  | 'error'
  | 'live'
  | 'reconnecting'
  | 'unavailable'
  | 'unconfigured'

export type SyncTransferStatus = 'idle' | 'loading' | 'saving'

// oxlint-disable-next-line typescript/consistent-type-definitions -- Snapshot is exported data, not an implementation contract.
export type SyncSnapshot = {
  config: {
    enabled: boolean
    hardDisabled: boolean
    workerUrl: string | undefined
  }
  connection: {
    lastError: string | undefined
    stats: SynchronizerStats | undefined
    status: SyncConnectionStatus
    transfer: SyncTransferStatus
    url: string | undefined
  }
}

class BrowserSyncSettings {
  private readonly listeners = new Set<() => void>()
  private readonly storageName = SYNC_SETTINGS_STORAGE_NAME

  // Settings are parsed at the browser boundary so the rest of sync only sees precise data.
  get(): StoredSyncSettings {
    if (typeof window === 'undefined') {
      return StoredSyncSettingsSchema.parse({})
    }

    const rawValue = localStorage.getItem(this.storageName)
    if (rawValue === null) {
      return StoredSyncSettingsSchema.parse({})
    }

    return StoredSyncSettingsSchema.parse(JSON.parse(rawValue))
  }

  // The settings handle owns same-tab persistence and notification for user consent changes.
  set(patch: Partial<StoredSyncSettings>): void {
    if (typeof window === 'undefined') {
      return
    }

    const settings = StoredSyncSettingsSchema.parse({ ...this.get(), ...patch })
    localStorage.setItem(this.storageName, JSON.stringify(settings))
    this.emit()
  }

  // React and other tabs both subscribe here; callers do not need to know localStorage mechanics.
  subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') {
      return noopUnsubscribe
    }

    this.listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key === this.storageName) {
        listener()
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      this.listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  // Same-tab writes do not emit a browser storage event, so this local listener set fills the gap.
  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const syncSettings = new BrowserSyncSettings()

class WebSyncRuntimeController<Schemas extends OptionalSchemas> {
  private activeConnection: RemoteSyncConnection<Schemas> | undefined
  private generation = 0
  private readonly libraryStore: MergeableStore<Schemas>
  private readonly listeners = new Set<() => void>()
  private readonly settings = syncSettings
  private snapshot = createIdleSnapshot(resolveSyncConfig())

  // The runtime is the app-level sync instance: it owns consent, one connection, and React status.
  constructor(libraryStore: MergeableStore<Schemas>) {
    this.libraryStore = libraryStore
    this.settings.subscribe(() => {
      void this.reconcileRemoteSync()
    })
    void this.reconcileRemoteSync()
  }

  // React reads an immutable snapshot while the controller keeps the mutable lifecycle private.
  getSnapshot(): SyncSnapshot {
    return this.snapshot
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

    this.updateConnection({ stats, transfer: 'idle' })
  }

  // User consent is stored in the browser settings handle, which then drives reconciliation.
  setEnabled(enabled: boolean): void {
    this.settings.set({ enabled })
  }

  // Subscribers only observe snapshot changes; they cannot mutate the controller internals.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Reconciliation is the top-level lifecycle story: resolve config, close, or open exactly one remote.
  private async reconcileRemoteSync(): Promise<void> {
    const config = resolveSyncConfig()
    this.generation += 1
    const { generation } = this
    this.emitSnapshot({
      ...createIdleSnapshot(config),
      connection: { ...this.snapshot.connection },
    })

    if (!config.enabled || config.workerUrl === undefined) {
      await this.closeRemoteConnection()
      this.emitSnapshot(createIdleSnapshot(config))
      return
    }

    const url = buildSyncUrl(config.workerUrl)
    if (this.activeConnection?.url === url) {
      return
    }

    await this.closeRemoteConnection()
    if (generation !== this.generation) {
      return
    }

    await this.openRemoteConnection({ generation, url })
  }

  // Opening creates a connection object first, then wires status events back into this runtime.
  private async openRemoteConnection(args: { generation: number; url: string }): Promise<void> {
    this.updateConnection({
      lastError: undefined,
      status: 'connecting',
      transfer: 'idle',
      url: args.url,
    })

    const connection = new RemoteSyncConnection<Schemas>(args.url)
    this.activeConnection = connection
    this.listenToConnection(connection)

    const didStart = await connection.start(this.libraryStore, (transfer) => {
      if (!this.isActiveConnection(connection)) {
        return
      }

      this.updateConnection({ stats: connection.getStats(), transfer })
    })
    if (this.isStaleConnection(connection, args.generation)) {
      await connection.close()
      return
    }

    if (!didStart) {
      this.updateConnection({
        lastError: 'Remote sync connect failed',
        status: 'error',
        url: args.url,
      })
      await connection.close()
      return
    }

    this.updateConnection({
      stats: connection.getStats(),
      status: connection.getStatus(),
      transfer: 'idle',
      url: args.url,
    })
  }

  // Closing invalidates the active instance before cleanup so late socket events are ignored.
  private async closeRemoteConnection(): Promise<void> {
    const connection = this.activeConnection
    this.activeConnection = undefined
    if (connection === undefined) {
      return
    }

    await connection.close()
  }

  // Socket events are interpreted by the runtime because only it knows whether the connection is current.
  private listenToConnection(connection: RemoteSyncConnection<Schemas>): void {
    connection.listenToSocket({
      onClose: () => {
        if (!this.isActiveConnection(connection)) {
          return
        }

        this.updateConnection({ status: 'reconnecting', transfer: 'idle', url: connection.url })
      },
      onError: (event) => {
        if (!this.isActiveConnection(connection)) {
          return
        }

        this.updateConnection({
          lastError: event.message ?? String(event.error ?? 'WebSocket error'),
          status: 'reconnecting',
          transfer: 'idle',
          url: connection.url,
        })
      },
      onOpen: () => {
        if (!this.isActiveConnection(connection)) {
          return
        }

        this.updateConnection({ lastError: undefined, status: 'live', url: connection.url })
        void this.resync()
      },
    })
  }

  // Generation checks reject async completions from connections opened by an older config.
  private isStaleConnection(
    connection: RemoteSyncConnection<Schemas>,
    generation: number,
  ): boolean {
    return generation !== this.generation || !this.isActiveConnection(connection)
  }

  // Connection identity is the guard rail that keeps reconnect events from stale sockets out of React.
  private isActiveConnection(connection: RemoteSyncConnection<Schemas>): boolean {
    return !connection.isClosing() && this.activeConnection === connection
  }

  // Snapshot updates are centralized so every status change notifies React the same way.
  private updateConnection(connection: Partial<SyncSnapshot['connection']>): void {
    this.emitSnapshot({
      ...this.snapshot,
      connection: {
        ...this.snapshot.connection,
        ...connection,
      },
    })
  }

  // The snapshot is the only outward-facing state; listeners are just invalidation hooks.
  private emitSnapshot(snapshot: SyncSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) {
      listener()
    }
  }
}

class RemoteSyncConnection<Schemas extends OptionalSchemas> {
  readonly url: string
  private closing = false
  private readonly removeSocketListeners: (() => void)[] = []
  private readonly socket: ReconnectingWebSocket
  private statusListenerId: string | undefined
  private synchronizer: WsSynchronizer<Schemas, WebSocket> | undefined

  // A connection owns one reconnecting socket and, once created, one TinyBase synchronizer.
  constructor(url: string) {
    this.url = url
    this.socket = new ReconnectingWebSocket(url)
  }

  // The runtime supplies interpretation callbacks while the connection owns listener cleanup.
  listenToSocket(handlers: {
    onClose(): void
    onError(event: ReconnectingWebSocketErrorEvent): void
    onOpen(): void
  }): void {
    const onOpen = () => {
      handlers.onOpen()
    }
    const onClose = () => {
      handlers.onClose()
    }
    const onError = (event: ReconnectingWebSocketErrorEvent) => {
      handlers.onError(event)
    }

    this.socket.addEventListener('open', onOpen)
    this.removeSocketListeners.push(() => {
      this.socket.removeEventListener('open', onOpen)
    })

    this.socket.addEventListener('close', onClose)
    this.removeSocketListeners.push(() => {
      this.socket.removeEventListener('close', onClose)
    })

    this.socket.addEventListener('error', onError)
    this.removeSocketListeners.push(() => {
      this.socket.removeEventListener('error', onError)
    })
  }

  // Starting is the boundary where the reconnecting socket becomes a TinyBase synchronizer.
  async start(
    libraryStore: MergeableStore<Schemas>,
    onTransfer: (transfer: SyncTransferStatus) => void,
  ): Promise<boolean> {
    const synchronizer = await createRemoteSynchronizer(libraryStore, this.socket)
    if (synchronizer === undefined) {
      return false
    }

    this.synchronizer = synchronizer
    this.statusListenerId = synchronizer.addStatusListener((_synchronizer, status) => {
      onTransfer(toTransferStatus(status))
    })
    await runSync(synchronizer.startSync(), 'start')
    return true
  }

  // Manual resync keeps TinyBase load/save mechanics hidden behind the connection instance.
  async resync(): Promise<SynchronizerStats | undefined> {
    if (this.synchronizer === undefined) {
      return undefined
    }

    await runSync(this.synchronizer.load(), 'load')
    await runSync(this.synchronizer.save(), 'save')
    return this.synchronizer.getSynchronizerStats()
  }

  // Close owns every cleanup path so callers do not need to remember socket versus synchronizer details.
  async close(): Promise<void> {
    this.closing = true
    for (const removeSocketListener of this.removeSocketListeners) {
      removeSocketListener()
    }

    if (this.synchronizer !== undefined && this.statusListenerId !== undefined) {
      this.synchronizer.delListener(this.statusListenerId)
    }
    if (this.synchronizer !== undefined) {
      await runSync(this.synchronizer.destroy(), 'destroy')
      return
    }

    this.socket.close()
  }

  // Current stats remain a query on the connection instead of leaking the synchronizer object.
  getStats(): SynchronizerStats | undefined {
    return this.synchronizer?.getSynchronizerStats()
  }

  // Socket readiness is translated into the status vocabulary React already understands.
  getStatus(): SyncConnectionStatus {
    return this.socket.readyState === this.socket.OPEN ? 'live' : 'reconnecting'
  }

  // Late events use this to avoid reporting changes after the runtime has started closing.
  isClosing(): boolean {
    return this.closing
  }
}

// The web sync runtime owns remote socket consent, lifecycle, and status. Store creation stays in
// store.ts, but all remote sync behavior after that point lives here.
export function createWebSyncRuntime<Schemas extends OptionalSchemas>(
  libraryStore: MergeableStore<Schemas>,
) {
  return new WebSyncRuntimeController(libraryStore)
}

export function useSyncSnapshot(sync: {
  getSnapshot(): SyncSnapshot
  subscribe(listener: () => void): () => void
}): SyncSnapshot {
  return useSyncExternalStore(
    (listener) => sync.subscribe(listener),
    () => sync.getSnapshot(),
    () => createIdleSnapshot({ enabled: false, hardDisabled: false, workerUrl: undefined }),
  )
}

export function canResync(snapshot: SyncSnapshot): boolean {
  return snapshot.config.enabled && snapshot.connection.status === 'live'
}

async function createRemoteSynchronizer<Schemas extends OptionalSchemas>(
  libraryStore: MergeableStore<Schemas>,
  socket: ReconnectingWebSocket,
): Promise<WsSynchronizer<Schemas, WebSocket> | undefined> {
  return await runSync(
    createWsSynchronizer(
      libraryStore,
      asTinyBaseWebSocket(socket),
      SYNC_REQUEST_TIMEOUT_SECONDS,
      undefined,
      undefined,
      reportRemoteSyncError,
    ),
    'connect',
  )
}

// TinyBase documents ReconnectingWebSocket compatibility, but its type only names native browser
// WebSocket and ws.WebSocket, so the compatibility assertion stays at this seam.
// oxlint-disable no-unsafe-type-assertion, typescript/no-unsafe-type-assertion -- Runtime-compatible RWS is the documented TinyBase recommendation.
function asTinyBaseWebSocket(socket: ReconnectingWebSocket): WebSocket {
  return socket as unknown as WebSocket
}

function reportRemoteSyncError(error: unknown): void {
  console.error('[stores:web] remote library sync error', error)
}

function resolveSyncConfig(): SyncSnapshot['config'] {
  const settings = syncSettings.get()
  const hardDisabled = getEnv('VITE_SYNC_ENABLED') === 'false'

  return {
    enabled: hardDisabled ? false : settings.enabled,
    hardDisabled,
    workerUrl: settings.workerUrl ?? getEnv('VITE_SYNC_WORKER_URL'),
  }
}

function createIdleSnapshot(config: SyncSnapshot['config']): SyncSnapshot {
  return {
    config,
    connection: {
      lastError: undefined,
      stats: undefined,
      status: getIdleStatus(config),
      transfer: 'idle',
      url: undefined,
    },
  }
}

function getIdleStatus(config: SyncSnapshot['config']): SyncConnectionStatus {
  if (config.hardDisabled) {
    return 'unavailable'
  }
  if (!config.enabled) {
    return 'disabled'
  }
  if (config.workerUrl === undefined) {
    return 'unconfigured'
  }

  return 'connecting'
}

function buildSyncUrl(workerUrl: string): string {
  const url = new URL('/sync', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  return url.toString()
}

function toTransferStatus(status: number): SyncTransferStatus {
  if (status === TINYBASE_STATUS_LOADING) {
    return 'loading'
  }
  if (status === TINYBASE_STATUS_SAVING) {
    return 'saving'
  }
  if (status === TINYBASE_STATUS_IDLE) {
    return 'idle'
  }

  return 'idle'
}

async function runSync<T>(operation: Promise<T>, label: string): Promise<Awaited<T> | undefined> {
  try {
    return await operation
  } catch (error: unknown) {
    console.error(`[stores:web] remote sync ${label} error`, error)
    return undefined
  }
}

function noopUnsubscribe(): void {
  return undefined
}

function getEnv(name: string): string | undefined {
  const rawValue: unknown = import.meta.env[name]
  if (typeof rawValue !== 'string') {
    return undefined
  }

  const value = rawValue.trim()
  return value === '' ? undefined : value
}
