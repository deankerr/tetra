import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions } from '../client.ts'

export interface ExaAnswerToolOptions extends ExaClientOptions {
  includeText?: boolean
  model?: 'exa' | 'exa-pro'
}

const inputSchema = z.object({
  query: z.string().describe('The question to answer.'),
})

export function exaAnswer(options: ExaAnswerToolOptions): Tool {
  const client = new ExaClient(options)

  return tool({
    description: 'Ask Exa a question and receive a generated answer grounded in cited web sources.',
    execute: async (input, { abortSignal }) =>
      await client.answer(
        {
          model: options.model,
          query: input.query,
          text: options.includeText,
        },
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
