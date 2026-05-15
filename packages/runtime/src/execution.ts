import { getCredential } from '@tetra/credentials/store'
import { streamInference } from '@tetra/inference'
import type { InferenceFinishMetadata } from '@tetra/inference'
import type { RequestConfig, TetraStore } from '@tetra/store'

import { gatherMessages } from './context'
import { resolveTools } from './tools'

class MissingProviderSecretError extends Error {
  constructor() {
    super('OpenRouter API key not configured. Add your key in Settings.')
    this.name = 'MissingProviderSecretError'
  }
}

export const executeRequest = async (
  context: {
    controllers: Map<string, AbortController>
    indexes: TetraStore['indexes']
    store: TetraStore['store']
  },
  args: {
    assistantMessageId: string
    config: RequestConfig
    requestId: string
    sessionId: string
  },
) => {
  const { indexes, store } = context
  const { assistantMessageId, config, requestId, sessionId } = args
  const controller = new AbortController()
  context.controllers.set(requestId, controller)

  try {
    // Gather messages immediately before the provider call.
    const messages = gatherMessages(
      { indexes, store },
      { assistantMessageId, maxMessages: config.maxMessages, sessionId },
    )

    const apiKey = getCredential('openRouterApiKey')
    if (apiKey === '') {
      throw new MissingProviderSecretError()
    }

    // Treat stored tool ids like user input at the request boundary.
    const { toolContext, tools } = resolveTools(config.toolIds)

    console.log('[runtime]', 'streaming', {
      assistantMessageId,
      maxMessages: config.maxMessages ?? 'all',
      messageCount: messages.length,
      modelId: config.modelId,
      requestId,
      sessionId,
      toolIds: Object.keys(tools),
    })

    // Stream provider snapshots into the assistant message.
    let received = false
    let finishMetadata: InferenceFinishMetadata | undefined
    for await (const snapshot of streamInference({
      assistantMessageId,
      config,
      messages,
      onFinish: (metadata) => {
        finishMetadata = metadata
      },
      providerCredentials: { openRouterApiKey: apiKey },
      signal: controller.signal,
      toolContext,
      tools,
    })) {
      received = true
      if (store.hasRow('messages', assistantMessageId)) {
        store.setPartialRow('messages', assistantMessageId, {
          parts: snapshot.parts,
          updatedAt: Date.now(),
        })
      }
    }

    // Stream may exit cleanly on abort rather than throwing — check before writing completion.
    if (controller.signal.aborted) {
      onAbort(store, requestId, controller.signal.reason)
      return
    }

    if (!received) {
      store.setPartialRow('requests', requestId, {
        errorMessage: 'Empty response from model',
        status: 'error',
      })
      console.error('[runtime]', 'empty stream', { assistantMessageId, requestId })
      return
    }

    store.setPartialRow('requests', requestId, {
      status: 'completed',
      usage: finishMetadata === undefined ? {} : toRequestUsageSnapshot(finishMetadata),
    })
    console.log('[runtime]', 'completed', { assistantMessageId, requestId })
  } catch (error) {
    if (controller.signal.aborted) {
      onAbort(store, requestId, controller.signal.reason)
      return
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error'
    store.setPartialRow('requests', requestId, { errorMessage, status: 'error' })
    console.error('[runtime]', 'error', { errorMessage, requestId, sessionId })
  } finally {
    context.controllers.delete(requestId)
  }
}

function onAbort(store: TetraStore['store'], requestId: string, reason: unknown) {
  if (reason === 'user-cancel') {
    store.setPartialRow('requests', requestId, { status: 'cancelled' })
    console.log('[runtime]', 'cancelled', { requestId })
  } else {
    store.setPartialRow('requests', requestId, {
      errorMessage: 'Interrupted by app shutdown',
      status: 'error',
    })
    console.log('[runtime]', 'shutdown', { requestId })
  }
}

function toRequestUsageSnapshot(metadata: InferenceFinishMetadata): Record<string, unknown> {
  // Store per-step accounting so tool loops do not hide cost in the final step.
  const steps = metadata.steps.map((step) => {
    const provider = getOpenRouterProviderUsage(step.providerMetadata)
    return {
      cost: getUsageCost(provider),
      finishReason: step.finishReason,
      model: step.model,
      provider,
      stepNumber: step.stepNumber,
      usage: step.usage,
    }
  })

  return {
    steps,
    total: {
      cost: steps.reduce((total, step) => total + step.cost, 0),
      usage: metadata.totalUsage,
    },
  }
}

function getOpenRouterProviderUsage(providerMetadata: unknown): unknown {
  if (!isRecord(providerMetadata)) {
    return null
  }
  const { openrouter } = providerMetadata
  if (!isRecord(openrouter)) {
    return null
  }
  return openrouter.usage ?? null
}

function getUsageCost(usage: unknown): number {
  if (!isRecord(usage)) {
    return 0
  }
  return typeof usage.cost === 'number' ? usage.cost : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
