import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions, ExaContentsConfig } from '../client.ts'

const MAX_RESULTS = 25

export interface ExaFindSimilarToolOptions extends ExaClientOptions {
  contents?: ExaContentsConfig
  numResults?: number
}

const inputSchema = z.object({
  excludeSourceDomain: z
    .boolean()
    .optional()
    .describe('Exclude results from the same domain as the source URL.'),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS)
    .optional()
    .describe('Number of results to return.'),
  url: z.string().describe('The URL to find semantically similar pages for.'),
})

export function exaFindSimilar(options: ExaFindSimilarToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { text: true }
  const defaultNumResults = options.numResults ?? 5

  return tool({
    description: 'Find web pages semantically similar to a given URL using Exa.',
    execute: async (input, { abortSignal }) =>
      await client.findSimilar(
        {
          contents,
          excludeSourceDomain: input.excludeSourceDomain,
          numResults: input.numResults ?? defaultNumResults,
          url: input.url,
        },
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
