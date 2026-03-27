import { infer } from './infer.ts'
import type { DataLayer } from './tables/index.ts'

export type Engine = { stop: () => void }

/**
 * Start the reactive engine. Watches the requests table via TinyBase listeners
 * and streams AI responses when pending requests appear.
 */
export const startEngine = (data: DataLayer, runtimeId: string): Engine => {
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
          void executeRequest(data, controllers, requestId, request.sessionId)
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
  controllers: Map<string, AbortController>,
  requestId: string,
  sessionId: string,
) => {
  const controller = new AbortController()
  controllers.set(requestId, controller)

  try {
    // Validate request
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

    // Resolve API key at execution time
    const apiKey = data.store.getValue('openrouterApiKey')
    if (typeof apiKey !== 'string' || apiKey === '') {
      data.requests.update(requestId, {
        errorMessage: 'OpenRouter API key not configured. Add your key in Settings.',
        status: 'error',
      })
      console.error('[runtime]', 'missing API key', { requestId })
      return
    }

    // Prepare context — collect recent messages, excluding the empty assistant placeholder
    const messages = data.messages.listRecentBySession(sessionId, config.maxMessages, [
      assistantMessageId,
    ])

    console.log('[runtime]', 'streaming', {
      assistantMessageId,
      maxMessages: config.maxMessages ?? 'all',
      messageCount: messages.length,
      modelId: config.modelId,
      requestId,
      sessionId,
    })

    // Stream inference — write each snapshot to the store as it arrives
    let received = false
    for await (const snapshot of infer({
      apiKey,
      assistantMessageId,
      config,
      messages,
      signal: controller.signal,
    })) {
      received = true
      data.messages.writeStreamChunk(assistantMessageId, snapshot)
    }

    // Empty stream — model returned nothing
    if (!received) {
      data.requests.update(requestId, {
        errorMessage: 'Empty response from model',
        status: 'error',
      })
      console.error('[runtime]', 'empty stream', { assistantMessageId, requestId })
      return
    }

    data.requests.update(requestId, { status: 'completed' })
    console.log('[runtime]', 'completed', { assistantMessageId, requestId })
  } catch (error) {
    // Abort — user cancelled or runtime stopped
    if (controller.signal.aborted) {
      data.requests.update(requestId, { status: 'cancelled' })
      console.log('[runtime]', 'aborted', { requestId, sessionId })
      return
    }

    // Streaming/network/provider error
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    data.requests.update(requestId, { errorMessage, status: 'error' })
    console.error('[runtime]', 'error', { errorMessage, requestId, sessionId })
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
