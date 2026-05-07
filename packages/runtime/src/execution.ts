import { decodeMessage, decodeRequest } from '@tetra/store'

import type { RuntimeContext } from './types.ts'

export const executeRequest = async (
  context: RuntimeContext,
  args: { requestId: string; sessionId: string },
) => {
  const { indexes, inference, store } = context
  const { requestId, sessionId } = args
  const controller = new AbortController()
  context.controllers.set(requestId, controller)

  try {
    // Validate the run record before touching inference.
    if (!store.hasRow('requests', requestId)) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const request = decodeRequest(requestId, store.getRow('requests', requestId))
    const { assistantMessageId, config: requestConfig } = request
    if (requestConfig === null) {
      store.setPartialRow('requests', requestId, {
        errorMessage: 'Request missing config snapshot',
        status: 'error',
      })
      console.error('[runtime]', 'request missing config', { requestId })
      return
    }

    // Gather context immediately before the provider call.
    let messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
    messageIds = messageIds.filter((id) => id !== assistantMessageId)
    if (requestConfig.maxMessages !== undefined) {
      messageIds = messageIds.slice(-requestConfig.maxMessages)
    }
    const messages = messageIds
      .filter((id) => store.hasRow('messages', id))
      .map((id) => decodeMessage(id, store.getRow('messages', id)))

    console.log('[runtime]', 'streaming', {
      assistantMessageId,
      maxMessages: requestConfig.maxMessages ?? 'all',
      messageCount: messages.length,
      modelId: requestConfig.modelId,
      requestId,
      sessionId,
    })

    // Stream provider snapshots into the assistant message.
    let received = false
    for await (const snapshot of inference.streamText({
      assistantMessageId,
      config: requestConfig,
      messages,
      signal: controller.signal,
    })) {
      received = true
      if (store.hasRow('messages', assistantMessageId)) {
        store.setPartialRow('messages', assistantMessageId, {
          parts: snapshot.parts,
          updatedAt: Date.now(),
        })
      }
    }

    if (!received) {
      store.setPartialRow('requests', requestId, {
        errorMessage: 'Empty response from model',
        status: 'error',
      })
      console.error('[runtime]', 'empty stream', { assistantMessageId, requestId })
      return
    }

    store.setPartialRow('requests', requestId, { status: 'completed' })
    console.log('[runtime]', 'completed', { assistantMessageId, requestId })
  } catch (error) {
    // Runtime shutdown aborts the active provider stream.
    if (controller.signal.aborted) {
      store.setPartialRow('requests', requestId, {
        errorMessage: 'Interrupted by app shutdown',
        status: 'error',
      })
      console.log('[runtime]', 'aborted', { requestId, sessionId })
      return
    }

    // Provider and network errors become request errors.
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    store.setPartialRow('requests', requestId, { errorMessage, status: 'error' })
    console.error('[runtime]', 'error', { errorMessage, requestId, sessionId })
  } finally {
    context.controllers.delete(requestId)
  }
}
