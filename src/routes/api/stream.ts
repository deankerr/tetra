import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createFileRoute } from '@tanstack/react-router'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai'
import type { UIMessage } from 'ai'
import { z } from 'zod'

import { sessionConfigSchema } from '@/lib/shared/session-config'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const messageSchema = z.looseObject({
  id: z.string(),
  parts: z.array(z.looseObject({ type: z.string() })),
  role: z.enum(['user', 'assistant', 'system']),
})

const requestSchema = sessionConfigSchema.omit({ maxMessages: true }).extend({
  assistantMessageId: z.string().min(1),
  messages: z.array(messageSchema).min(1),
})

export const Route = createFileRoute('/api/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.OPENROUTER_API_KEY === undefined || process.env.OPENROUTER_API_KEY === '') {
          console.error('[api/stream]', 'OPENROUTER_API_KEY is missing')
          return new Response('OPENROUTER_API_KEY is missing', { status: 500 })
        }

        const body: unknown = await request.json()
        const parsed = requestSchema.safeParse(body)
        if (!parsed.success) {
          console.error('[api/stream]', 'invalid request', parsed.error.message)
          return new Response(parsed.error.message, { status: 400 })
        }

        const { assistantMessageId, modelId, providerOptions, systemPrompt } = parsed.data

        console.log('[api/stream]', 'start', { assistantMessageId, modelId })

        // Zod validates structural integrity; UIMessage is the canonical type.
        // oxlint-disable-next-line no-unsafe-type-assertion -- system boundary: Zod-validated input
        const messages = parsed.data.messages as unknown as UIMessage[]

        // Strip IDs before converting to model messages
        const modelMessages = await convertToModelMessages(
          messages.map(({ id: _id, ...message }) => message),
        )

        const result = streamText({
          messages: modelMessages,
          model: openrouter(modelId),
          onAbort: () => {
            console.log('[api/stream]', 'abort', { assistantMessageId })
          },
          onFinish: ({ finishReason, usage }) => {
            console.log('[api/stream]', 'finish', {
              assistantMessageId,
              finishReason,
              tokens: usage.totalTokens,
            })
          },
          // oxlint-disable-next-line no-unsafe-type-assertion -- system boundary: Zod-validated JSON
          providerOptions: providerOptions ? { openrouter: providerOptions } : undefined,
          system: systemPrompt,
        })

        // Wrap in createUIMessageStream so provider errors (e.g. invalid model)
        // are caught and encoded as protocol-level error events instead of
        // silently terminating the HTTP body.
        const stream = createUIMessageStream({
          execute: ({ writer }) => {
            writer.merge(
              result.toUIMessageStream({
                generateMessageId: () => assistantMessageId,
                originalMessages: messages,
              }),
            )
          },
          onError: (error) => {
            const msg = error instanceof Error ? error.message : 'Unknown error'
            console.error('[api/stream]', 'stream error', { assistantMessageId, error: msg })
            return msg
          },
        })

        return createUIMessageStreamResponse({ stream })
      },
    },
  },
})
