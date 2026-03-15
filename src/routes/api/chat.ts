import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createFileRoute } from '@tanstack/react-router'
import { streamText, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

type ChatRequest = {
  assistantMessageId?: string
  maxTokens?: number
  messages?: UIMessage[]
  model?: string
  systemPrompt?: string
  temperature?: number
}

const isChatRequest = (value: unknown): value is ChatRequest =>
  typeof value === 'object' && value !== null

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.OPENROUTER_API_KEY === undefined || process.env.OPENROUTER_API_KEY === '') {
          return new Response('OPENROUTER_API_KEY is missing', { status: 500 })
        }

        const body: unknown = await request.json()
        if (!isChatRequest(body)) {
          return new Response('Invalid request body', { status: 400 })
        }

        const messages = Array.isArray(body.messages) ? body.messages : []
        const modelId = typeof body.model === 'string' && body.model ? body.model : null
        const assistantMessageId =
          typeof body.assistantMessageId === 'string' && body.assistantMessageId
            ? body.assistantMessageId
            : null

        if (modelId === null || assistantMessageId === null || messages.length === 0) {
          return new Response('Missing model, assistantMessageId, or messages', { status: 400 })
        }

        const modelMessages = await convertToModelMessages(
          messages.map(({ id: _id, ...message }) => message),
        )

        const result = streamText({
          maxOutputTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
          messages: modelMessages,
          model: openrouter(modelId),
          system: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
          temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        })

        return result.toUIMessageStreamResponse({
          generateMessageId: () => assistantMessageId,
          originalMessages: messages,
        })
      },
    },
  },
})
