import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions } from '../client.ts'

export const ExaAnswerRequestSchema = z.object({
  query: z.string().min(1),
  text: z.boolean().optional(),
})
export type ExaAnswerRequest = z.infer<typeof ExaAnswerRequestSchema>

export const ExaAnswerCitationSchema = z.looseObject({
  author: z.string().nullish(),
  favicon: z.string().nullish(),
  id: z.string(),
  image: z.string().nullish(),
  publishedDate: z.string().nullish(),
  text: z.string().optional(),
  title: z.string().nullish(),
  url: z.string(),
})
export type ExaAnswerCitation = z.infer<typeof ExaAnswerCitationSchema>

export const ExaAnswerResponseSchema = z.looseObject({
  answer: z.unknown(),
  citations: z.array(ExaAnswerCitationSchema).default([]),
  costDollars: z.looseObject({ total: z.number() }).nullish(),
})
export type ExaAnswerResponse = z.infer<typeof ExaAnswerResponseSchema>

export interface ExaAnswerToolOptions extends ExaClientOptions {
  includeText?: boolean
}

const inputSchema = z.object({
  query: z.string().describe('The question to answer.'),
})

export function exaAnswer(options: ExaAnswerToolOptions): Tool {
  const client = new ExaClient(options)

  return tool({
    description: 'Ask Exa a question and receive a generated answer grounded in cited web sources.',
    execute: async (input, { abortSignal }) =>
      await client.post(
        '/answer',
        ExaAnswerRequestSchema.parse({
          query: input.query,
          text: options.includeText,
        }),
        ExaAnswerResponseSchema,
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
