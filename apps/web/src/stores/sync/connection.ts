import ReconnectingWebSocket from 'reconnecting-websocket'
import type { ErrorEvent as ReconnectingWebSocketErrorEvent } from 'reconnecting-websocket'
import type { MergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { OptionalSchemas } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import type { WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import type { SynchronizerStats } from 'tinybase/synchronizers/with-schemas'

import type { SyncTransferStatus } from '@/stores'

const SYNC_REQUEST_TIMEOUT_SECONDS = 5
const TINYBASE_STATUS_LOADING = 1
const TINYBASE_STATUS_SAVING = 2

export interface SocketHandlers {
  onClose(): void
  onError(event: ReconnectingWebSocketErrorEvent): void
  onOpen(): void
}

// A connection owns one reconnecting socket and, once started, one TinyBase synchronizer.
// It is deliberately dumb about policy: the controller decides when connections open, close,
// and whether their events still matter.
export class SyncConnection<Schemas extends OptionalSchemas> {
  readonly url: string
  private closing = false
  private readonly removeSocketListeners: (() => void)[] = []
  private readonly socket: ReconnectingWebSocket
  private statusListenerId: string | undefined
  private synchronizer: WsSynchronizer<Schemas, WebSocket> | undefined

  constructor(url: string) {
    this.url = url
    this.socket = new ReconnectingWebSocket(url)
  }

  // The controller supplies interpretation callbacks while the connection owns listener cleanup.
  listenToSocket(handlers: SocketHandlers): void {
    const entries = [
      [
        'open',
        () => {
          handlers.onOpen()
        },
      ],
      [
        'close',
        () => {
          handlers.onClose()
        },
      ],
      [
        'error',
        (event: ReconnectingWebSocketErrorEvent) => {
          handlers.onError(event)
        },
      ],
    ] as const

    for (const [event, listener] of entries) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RWS's per-event listener map defeats a readonly tuple; the pairs above are correct.
      this.socket.addEventListener(event, listener as never)
      this.removeSocketListeners.push(() => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Same pairing as the add above.
        this.socket.removeEventListener(event, listener as never)
      })
    }
  }

  // Starting is the boundary where the reconnecting socket becomes a TinyBase synchronizer.
  async start(
    store: MergeableStore<Schemas>,
    onTransfer: (transfer: SyncTransferStatus) => void,
  ): Promise<boolean> {
    const synchronizer = await runSync(
      createWsSynchronizer(
        store,
        asTinyBaseWebSocket(this.socket),
        SYNC_REQUEST_TIMEOUT_SECONDS,
        undefined,
        undefined,
        reportSyncError,
      ),
      'connect',
    )
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

  // Close owns every cleanup path so callers never juggle socket versus synchronizer details.
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

  getStats(): SynchronizerStats | undefined {
    return this.synchronizer?.getSynchronizerStats()
  }

  isOpen(): boolean {
    return this.socket.readyState === this.socket.OPEN
  }

  // Late events use this to avoid reporting changes after the controller has started closing.
  isClosing(): boolean {
    return this.closing
  }
}

export function buildSyncUrl(workerUrl: string, key: string): string {
  const url = new URL(`/sync/${key}`, workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  return url.toString()
}

// TinyBase documents ReconnectingWebSocket compatibility, but its type only names native browser
// WebSocket and ws.WebSocket, so the compatibility assertion stays at this seam.
// oxlint-disable no-unsafe-type-assertion, typescript/no-unsafe-type-assertion -- Runtime-compatible RWS is the documented TinyBase recommendation.
function asTinyBaseWebSocket(socket: ReconnectingWebSocket): WebSocket {
  return socket as unknown as WebSocket
}

function toTransferStatus(status: number): SyncTransferStatus {
  if (status === TINYBASE_STATUS_LOADING) {
    return 'loading'
  }
  if (status === TINYBASE_STATUS_SAVING) {
    return 'saving'
  }

  return 'idle'
}

function reportSyncError(error: unknown): void {
  // A lone client on a channel has no peer to answer the resync probe; that swallowed error is
  // expected noise (the tab synchronizer filters its identical counterpart).
  const isNoPeerProbe =
    typeof error === 'string' &&
    error.startsWith('No response from anyone to ') &&
    error.endsWith(', 1')
  if (isNoPeerProbe) {
    return
  }
  console.error('[stores:sync] remote library sync error', error)
}

async function runSync<T>(operation: Promise<T>, label: string): Promise<Awaited<T> | undefined> {
  try {
    return await operation
  } catch (error: unknown) {
    console.error(`[stores:sync] ${label} error`, error)
    return undefined
  }
}
