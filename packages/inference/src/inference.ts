import type { JSONObject } from '@ai-sdk/provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { ToolSet, UIMessage } from 'ai'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'

export interface InferenceConfig {
  maxMessages?: number
  modelId: string
  providerOptions?: JSONObject
  systemPrompt?: string
}

export interface ProviderCredentials {
  openRouterApiKey: string
}

export interface StreamInferenceArgs {
  assistantMessageId: string
  config: InferenceConfig
  messages: UIMessage[]
  providerCredentials: ProviderCredentials
  signal?: AbortSignal
  toolContext?: unknown
  tools?: ToolSet
}

export async function* streamInference(options: StreamInferenceArgs): AsyncGenerator<UIMessage> {
  const {
    assistantMessageId,
    config,
    messages,
    providerCredentials,
    signal,
    toolContext,
    tools = {},
  } = options
  const { modelId, providerOptions, systemPrompt } = config

  // Build provider and convert messages to model format.
  const openrouter = createOpenRouter({ apiKey: providerCredentials.openRouterApiKey })
  const modelMessages = await convertToModelMessages(messages)
  const hasTools = Object.keys(tools).length > 0

  // Start streaming inference.
  const result = streamText({
    abortSignal: signal,
    experimental_context: toolContext,
    messages: modelMessages,
    model: openrouter(modelId),
    providerOptions: providerOptions ? { openrouter: providerOptions } : undefined,
    stopWhen: hasTools ? stepCountIs(3) : undefined,
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
