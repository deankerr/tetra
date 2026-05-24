import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions, ExaContentsConfig, ExaSearchType } from '../client.ts'

const MAX_RESULTS = 25

export interface ExaSearchToolOptions extends ExaClientOptions {
  category?: string
  contents?: ExaContentsConfig
  numResults?: number
  type?: ExaSearchType
}

const inputSchema = z.object({
  category: z
    .enum([
      'company',
      'financial report',
      'github',
      'linkedin profile',
      'news',
      'pdf',
      'personal site',
      'research paper',
      'tweet',
    ])
    .optional()
    .describe('Restrict results to a known content category.'),
  endPublishedDate: z
    .string()
    .optional()
    .describe('Only include results published on or before this ISO 8601 date.'),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe('Domains to exclude from results, e.g. ["reddit.com"].'),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe('Restrict results to these domains, e.g. ["arxiv.org"].'),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS)
    .optional()
    .describe('Number of results to return.'),
  query: z.string().describe('The search query.'),
  startPublishedDate: z
    .string()
    .optional()
    .describe('Only include results published on or after this ISO 8601 date.'),
  type: z
    .enum(['auto', 'fast', 'keyword', 'neural'])
    .optional()
    .describe('Search strategy. "auto" lets Exa pick between neural and keyword.'),
})

export function exaSearch(options: ExaSearchToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { text: true }
  const defaultNumResults = options.numResults ?? 5

  return tool({
    description: 'Search the web with Exa and return ranked results with extracted page contents.',
    execute: async (input, { abortSignal }) =>
      await client.search(
        {
          category: input.category ?? options.category,
          contents,
          endPublishedDate: input.endPublishedDate,
          excludeDomains: input.excludeDomains,
          includeDomains: input.includeDomains,
          numResults: input.numResults ?? defaultNumResults,
          query: input.query,
          startPublishedDate: input.startPublishedDate,
          type: input.type ?? options.type,
        },
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
