import type { JSONObject } from '@ai-sdk/provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { UIMessage } from 'ai'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'

import { createAvailableTools, resolveToolId } from './tools.ts'
import type { ToolId } from './tools.ts'

export interface InferenceConfig {
  maxMessages?: number
  modelId: string
  providerOptions?: JSONObject
  systemPrompt?: string
  toolIds?: string[]
}

export interface StreamInferenceArgs {
  apiKey: string
  assistantMessageId: string
  config: InferenceConfig
  jinaApiKey: string
  messages: UIMessage[]
  signal?: AbortSignal
}

export class MissingProviderSecretError extends Error {
  constructor() {
    super('OpenRouter API key not configured. Add your key in Settings.')
    this.name = 'MissingProviderSecretError'
  }
}

export async function* streamInference(options: StreamInferenceArgs): AsyncGenerator<UIMessage> {
  const { apiKey, assistantMessageId, config, jinaApiKey, messages, signal } = options
  const { modelId, providerOptions, systemPrompt, toolIds = [] } = config

  // Build provider and convert messages to model format.
  const openrouter = createOpenRouter({ apiKey })
  const modelMessages = await convertToModelMessages(messages)
  const availableTools = createAvailableTools({ jinaApiKey })
  const enabledToolIds = toolIds
    .map((toolId) => {
      const resolvedToolId = resolveToolId(toolId)
      if (resolvedToolId === null) {
        console.warn('[inference]', 'unknown tool id ignored', { toolId })
      }
      return resolvedToolId
    })
    .filter((toolId): toolId is ToolId => toolId !== null)
  const tools = Object.fromEntries(enabledToolIds.map((toolId) => [toolId, availableTools[toolId]]))

  // Start streaming inference.
  const result = streamText({
    abortSignal: signal,
    messages: modelMessages,
    model: openrouter(modelId),
    providerOptions: providerOptions ? { openrouter: providerOptions } : undefined,
    stopWhen: enabledToolIds.length > 0 ? stepCountIs(3) : undefined,
    system: systemPrompt,
    tools,
  })

  // Convert the provider stream into AI SDK UIMessage snapshots.
  const stream = readUIMessageStream<UIMessage>({
    message: {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    },
    stream: result.toUIMessageStream({
      generateMessageId: () => assistantMessageId,
      sendReasoning: true,
    }),
    terminateOnError: true,
  })

  yield* stream
}
