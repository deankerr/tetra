import type { DataLayer } from './data/index.ts'
import type { ChatTransport, StreamResult } from './stream.ts'
import { streamResponse } from './stream.ts'

export type Runtime = { stop: () => void }

/**
 * Start the reactive runtime. Watches the requests table via TinyBase listeners
 * and streams AI responses when pending requests appear.
 */
export const startRuntime = (
  data: DataLayer,
  transport: ChatTransport,
  runtimeId: string,
): Runtime => {
  const controllers = new Map<string, AbortController>()

  // Recovery: mark requests claimed by this runtime that were stuck from a previous session
  recoverStaleRequests(data, runtimeId)

  // Listener 1: detect new request rows (mutator — can write to store)
  const rowIdsListenerId = data.store.addRowIdsListener(
    'requests',
    (_store, _tableId, getIdChanges) => {
      const changes = getIdChanges?.() ?? {}
      for (const [requestId, change] of Object.entries(changes)) {
        if (change !== 1) {
          continue
        }

        const request = data.requests.get(requestId)
        if (request === null || request.status !== 'pending') {
          continue
        }

        // Only process requests claimed by this runtime
        if (request.claimedBy !== runtimeId) {
          continue
        }

        // Claim: mark as streaming
        data.requests.update(requestId, { status: 'streaming' })

        // Defer to next microtask — indexes (messagesBySession) haven't
        // processed the transaction's writes yet during the mutator phase
        queueMicrotask(() => {
          void executeRequest(data, transport, controllers, requestId, request.sessionId)
        })
      }
    },
    true, // mutator
  )

  // Listener 2: detect cancel (status changed to 'cancelled')
  const cellListenerId = data.store.addCellListener(
    'requests',
    null,
    'status',
    (_store, _tableId, requestId, _cellId, newValue) => {
      if (newValue !== 'cancelled') {
        return
      }

      const controller = controllers.get(requestId)
      if (controller === undefined) {
        return
      }

      controller.abort()
      controllers.delete(requestId)
      console.log('[runtime]', 'cancel signal received', { requestId })
    },
  )

  console.log('[runtime]', 'started', { runtimeId })

  return {
    stop() {
      data.store.delListener(rowIdsListenerId)
      data.store.delListener(cellListenerId)

      // Abort all in-flight streams
      for (const controller of controllers.values()) {
        controller.abort()
      }
      controllers.clear()
      console.log('[runtime]', 'stopped')
    },
  }
}

// --- Private ---

const executeRequest = async (
  data: DataLayer,
  transport: ChatTransport,
  controllers: Map<string, AbortController>,
  requestId: string,
  sessionId: string,
) => {
  const controller = new AbortController()
  controllers.set(requestId, controller)

  try {
    // Read the request and its config snapshot
    const request = data.requests.getOrThrow(requestId)
    const { assistantMessageId, config } = request
    if (config === null) {
      data.requests.update(requestId, {
        errorMessage: 'Request missing config snapshot',
        status: 'error',
      })
      console.error('[runtime]', 'request missing config', { requestId })
      return
    }

    const result: StreamResult = await streamResponse(
      data,
      sessionId,
      assistantMessageId,
      config,
      transport,
      controller.signal,
    )

    // Map stream result to request status
    if (result.status === 'completed') {
      data.requests.update(requestId, { status: 'completed' })
    } else if (result.status === 'aborted') {
      data.requests.update(requestId, { status: 'cancelled' })
    } else {
      data.requests.update(requestId, { errorMessage: result.errorMessage, status: 'error' })
    }
  } catch (error) {
    // Unexpected error not caught by streamResponse
    const errorMessage = error instanceof Error ? error.message : 'Unknown runtime error'
    data.requests.update(requestId, { errorMessage, status: 'error' })
    console.error('[runtime]', 'unexpected error', { errorMessage, requestId })
  } finally {
    controllers.delete(requestId)
  }
}

const recoverStaleRequests = (data: DataLayer, runtimeId: string) => {
  const allRequestIds = data.store.getRowIds('requests')

  for (const id of allRequestIds) {
    const status = data.store.getCell('requests', id, 'status')
    if (status !== 'pending' && status !== 'streaming') {
      continue
    }

    // Only recover requests claimed by this runtime
    const claimedBy = data.store.getCell('requests', id, 'claimedBy')
    if (claimedBy !== runtimeId) {
      continue
    }

    data.requests.update(id, {
      errorMessage: 'Interrupted by app restart',
      status: 'error',
    })
  }
}
