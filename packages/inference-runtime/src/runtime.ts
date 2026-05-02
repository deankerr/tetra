import type { TetraStore } from '@tetra/store'

import { infer } from './infer.ts'

export type InferenceRuntime = { start: () => void; stop: () => void }

export type InferenceRuntimeConfig = {
  executorId: string
  getOpenRouterApiKey?: () => Promise<string | null | undefined> | string | null | undefined
  tetra: TetraStore
}

export const createInferenceRuntime = (config: InferenceRuntimeConfig): InferenceRuntime => {
  const { data } = config.tetra.internal
  const controllers = new Map<string, AbortController>()
  let rowIdsListenerId: string | undefined
  let cellListenerId: string | undefined

  return {
    start() {
      if (rowIdsListenerId !== undefined || cellListenerId !== undefined) {
        return
      }

      recoverStaleRequests(config)

      // Listener 1: detect new request rows.
      rowIdsListenerId = data.store.addRowIdsListener(
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

            // Only process requests targeted to this executor.
            if (request.targetExecutorId !== config.executorId) {
              continue
            }

            // Transition the targeted request into execution.
            data.requests.update(requestId, { status: 'streaming' })

            // Defer to next microtask because indexes may still be catching up
            // during the TinyBase mutator phase.
            queueMicrotask(() => {
              void executeRequest(config, controllers, requestId, request.sessionId)
            })
          }
        },
        true,
      )

      // Listener 2: detect cancel signals.
      cellListenerId = data.store.addCellListener(
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
          console.log('[inference-runtime]', 'cancel signal received', { requestId })
        },
      )

      console.log('[inference-runtime]', 'started', { executorId: config.executorId })
    },

    stop() {
      if (rowIdsListenerId !== undefined) {
        data.store.delListener(rowIdsListenerId)
        rowIdsListenerId = undefined
      }
      if (cellListenerId !== undefined) {
        data.store.delListener(cellListenerId)
        cellListenerId = undefined
      }

      // Abort all in-flight streams.
      for (const controller of controllers.values()) {
        controller.abort()
      }
      controllers.clear()
      console.log('[inference-runtime]', 'stopped')
    },
  }
}

const executeRequest = async (
  runtimeConfig: InferenceRuntimeConfig,
  controllers: Map<string, AbortController>,
  requestId: string,
  sessionId: string,
) => {
  const { data } = runtimeConfig.tetra.internal
  const controller = new AbortController()
  controllers.set(requestId, controller)

  try {
    // Validate request.
    const request = data.requests.getOrThrow(requestId)
    const { assistantMessageId, config: requestConfig } = request
    if (requestConfig === null) {
      data.requests.update(requestId, {
        errorMessage: 'Request missing config snapshot',
        status: 'error',
      })
      console.error('[inference-runtime]', 'request missing config', { requestId })
      return
    }

    // Resolve API key at execution time.
    const apiKey = await runtimeConfig.getOpenRouterApiKey?.()
    if (typeof apiKey !== 'string' || apiKey === '') {
      data.requests.update(requestId, {
        errorMessage: 'OpenRouter API key not configured. Add your key in Settings.',
        status: 'error',
      })
      console.error('[inference-runtime]', 'missing API key', { requestId })
      return
    }

    // Prepare context, excluding the empty assistant placeholder.
    const messages = data.messages.listRecentBySession(sessionId, requestConfig.maxMessages, [
      assistantMessageId,
    ])

    console.log('[inference-runtime]', 'streaming', {
      assistantMessageId,
      maxMessages: requestConfig.maxMessages ?? 'all',
      messageCount: messages.length,
      modelId: requestConfig.modelId,
      requestId,
      sessionId,
    })

    // Stream inference and write each snapshot to the store.
    let received = false
    for await (const snapshot of infer({
      apiKey,
      assistantMessageId,
      config: requestConfig,
      messages,
      signal: controller.signal,
    })) {
      received = true
      data.messages.writeStreamChunk(assistantMessageId, snapshot)
    }

    // Empty stream means the model returned nothing.
    if (!received) {
      data.requests.update(requestId, {
        errorMessage: 'Empty response from model',
        status: 'error',
      })
      console.error('[inference-runtime]', 'empty stream', { assistantMessageId, requestId })
      return
    }

    data.requests.update(requestId, { status: 'completed' })
    console.log('[inference-runtime]', 'completed', { assistantMessageId, requestId })
  } catch (error) {
    // Abort means user cancelled or runtime stopped.
    if (controller.signal.aborted) {
      data.requests.update(requestId, { status: 'cancelled' })
      console.log('[inference-runtime]', 'aborted', { requestId, sessionId })
      return
    }

    // Streaming/network/provider error.
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    data.requests.update(requestId, { errorMessage, status: 'error' })
    console.error('[inference-runtime]', 'error', { errorMessage, requestId, sessionId })
  } finally {
    controllers.delete(requestId)
  }
}

const recoverStaleRequests = (runtimeConfig: InferenceRuntimeConfig) => {
  const { data } = runtimeConfig.tetra.internal
  const allRequestIds = data.store.getRowIds('requests')

  for (const id of allRequestIds) {
    const status = data.store.getCell('requests', id, 'status')
    if (status !== 'pending' && status !== 'streaming') {
      continue
    }

    // Only recover requests targeted to this executor.
    const targetExecutorId = data.store.getCell('requests', id, 'targetExecutorId')
    if (targetExecutorId !== runtimeConfig.executorId) {
      continue
    }

    data.requests.update(id, {
      errorMessage: 'Interrupted by app restart',
      status: 'error',
    })
  }
}
