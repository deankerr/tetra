import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions, ExaContentsConfig } from '../client.ts'

export interface ExaGetContentsToolOptions extends ExaClientOptions {
  contents?: ExaContentsConfig
}

const inputSchema = z.object({
  livecrawl: z
    .enum(['always', 'fallback', 'never', 'preferred'])
    .optional()
    .describe('Live-crawl strategy. "fallback" crawls only when cached content is missing.'),
  urls: z.array(z.string()).min(1).describe('The page URLs to fetch contents for.'),
})

export function exaGetContents(options: ExaGetContentsToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { text: true }

  return tool({
    description:
      'Fetch cleaned page text, highlights, and summaries for one or more URLs using Exa.',
    execute: async (input, { abortSignal }) =>
      await client.getContents(
        {
          ...contents,
          livecrawl: input.livecrawl ?? contents.livecrawl,
          urls: input.urls,
        },
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
