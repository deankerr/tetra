import { generateId, parseRequestConfig } from '@tetra/store'
import type { RequestConfig } from '@tetra/store'

import type { RuntimeContext } from './context.ts'
import { executeRequest } from './execution.ts'

export const createRequests = (context: RuntimeContext) => {
  const { indexes, store } = context

  const create = (args: {
    assistantMessageId: string
    config?: RequestConfig
    messageId: string
    requestId?: string
    sessionId: string
  }) => {
    const { assistantMessageId, messageId, sessionId } = args

    // Request creation is bounded by an existing session and transcript pair.
    if (!store.hasRow('sessions', sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    if (!store.hasRow('messages', messageId)) {
      throw new Error(`Message not found: ${messageId}`)
    }
    if (!store.hasRow('messages', assistantMessageId)) {
      throw new Error(`Assistant message not found: ${assistantMessageId}`)
    }

    // A session executes only one request at a time.
    for (const requestId of indexes.getSliceRowIds('requestsBySession', sessionId)) {
      const status = store.getCell('requests', requestId, 'status')
      if (status === 'pending' || status === 'streaming') {
        throw new Error(`Session already has an active request: ${sessionId}`)
      }
    }

    // Cross-session request/message links are invalid at the runtime boundary.
    const message = store.getRow('messages', messageId)
    const assistantMessage = store.getRow('messages', assistantMessageId)
    if (message.sessionId !== sessionId || assistantMessage.sessionId !== sessionId) {
      throw new Error(`Request messages must belong to session: ${sessionId}`)
    }

    // Persist the request snapshot without starting provider work.
    const requestId = args.requestId ?? generateId.request()
    const session = store.getRow('sessions', sessionId)
    store.setRow('requests', requestId, {
      assistantMessageId,
      config: args.config ?? parseRequestConfig(session.config),
      createdAt: Date.now(),
      errorMessage: '',
      messageId,
      sessionId,
      status: 'pending',
    })

    console.log('[runtime:requests.create]', 'created', {
      assistantMessageId,
      messageId,
      requestId,
      sessionId,
    })
    return { requestId }
  }

  const start = (args: { requestId: string; sessionId: string }) => {
    const { requestId, sessionId } = args

    // Provider work starts outside the current store mutation turn.
    store.setPartialRow('requests', requestId, { status: 'streaming' })
    queueMicrotask(() => {
      void executeRequest(context, { requestId, sessionId })
    })

    console.log('[runtime:requests.start]', 'started', { requestId, sessionId })
  }

  return {
    create,

    execute(args: {
      assistantMessageId: string
      config?: RequestConfig
      messageId: string
      requestId?: string
      sessionId: string
    }) {
      // Create and start the request as two explicit runtime steps.
      const { requestId } = create(args)
      start({ requestId, sessionId: args.sessionId })
      return { requestId }
    },

    start,
  }
}
