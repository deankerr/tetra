import type { CredentialId } from '@tetra/credentials/registry'
import { getCredential } from '@tetra/credentials/store'
import { streamInference } from '@tetra/inference'
import { parseRequestConfig } from '@tetra/store'
import { toolsRegistryMap } from '@tetra/tools/registry'
import type { ToolDefinition } from '@tetra/tools/registry'
import type { ToolSet, UIMessage } from 'ai'

import type { RuntimeContext } from './types.ts'

class MissingProviderSecretError extends Error {
  constructor() {
    super('OpenRouter API key not configured. Add your key in Settings.')
    this.name = 'MissingProviderSecretError'
  }
}

export const executeRequest = async (
  context: RuntimeContext,
  args: { requestId: string; sessionId: string },
) => {
  const { indexes, store } = context
  const { requestId, sessionId } = args
  const controller = new AbortController()
  context.controllers.set(requestId, controller)

  try {
    // Validate the run record before touching inference.
    if (!store.hasRow('requests', requestId)) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const request = store.getRow('requests', requestId)
    const { assistantMessageId } = request
    const requestConfig = parseRequestConfig(request.config)

    // Gather context immediately before the provider call.
    let messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
    messageIds = messageIds.filter((id) => id !== assistantMessageId)
    if (requestConfig.maxMessages !== undefined) {
      messageIds = messageIds.slice(-requestConfig.maxMessages)
    }
    const messages = messageIds
      .filter((id) => store.hasRow('messages', id))
      .map((id) => {
        const row = store.getRow('messages', id)
        return {
          createdAt: row.createdAt,
          id,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase stores AI SDK parts in an array cell.
          parts: row.parts as UIMessage['parts'],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Runtime writers constrain message roles.
          role: row.role as UIMessage['role'],
          seq: row.seq,
          sessionId: row.sessionId,
          updatedAt: row.updatedAt,
        }
      })

    const apiKey = getCredential('openRouterApiKey')
    if (apiKey === '') {
      throw new MissingProviderSecretError()
    }

    const credentialIds = new Set<CredentialId>()
    const selectedTools = new Map<string, ToolDefinition>()

    // Treat stored tool ids like user input at the request boundary.
    for (const rawToolId of requestConfig.toolIds) {
      const toolDefinition = toolsRegistryMap.get(rawToolId)
      if (toolDefinition === undefined) {
        console.warn('[runtime]', 'unknown tool id ignored', { toolId: rawToolId })
        continue
      }

      for (const credentialId of toolDefinition.credentialIds) {
        credentialIds.add(credentialId)
      }

      selectedTools.set(rawToolId, toolDefinition)
    }

    const selectedToolIds = [...selectedTools.keys()]
    const tools: ToolSet = Object.fromEntries(
      [...selectedTools].map(([toolId, toolDefinition]) => [toolId, toolDefinition.aiTool]),
    )

    const toolContext = {
      credentials: Object.fromEntries(
        [...credentialIds].map((credentialId) => [credentialId, getCredential(credentialId)]),
      ),
    }

    console.log('[runtime]', 'streaming', {
      assistantMessageId,
      maxMessages: requestConfig.maxMessages ?? 'all',
      messageCount: messages.length,
      modelId: requestConfig.modelId,
      requestId,
      sessionId,
      toolIds: selectedToolIds,
    })

    // Stream provider snapshots into the assistant message.
    let received = false
    for await (const snapshot of streamInference({
      assistantMessageId,
      config: requestConfig,
      messages,
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
