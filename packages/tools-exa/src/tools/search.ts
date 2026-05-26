import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions } from '../client.ts'

const MAX_RESULTS = 25

const ExaSearchTypeSchema = z.enum([
  'auto',
  'deep',
  'deep-lite',
  'deep-reasoning',
  'fast',
  'instant',
])
export type ExaSearchType = z.infer<typeof ExaSearchTypeSchema>
export type ExaCategory = string

const ExaSearchHighlightsOptionsSchema = z.object({
  maxCharacters: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
})

export const ExaSearchContentsConfigSchema = z.object({
  highlights: z.union([z.boolean(), ExaSearchHighlightsOptionsSchema]).optional(),
  livecrawlTimeout: z.number().int().positive().optional(),
  maxAgeHours: z.number().int().min(-1).optional(),
})
export type ExaSearchContentsConfig = z.infer<typeof ExaSearchContentsConfigSchema>

export const ExaSearchRequestSchema = z.object({
  additionalQueries: z.array(z.string().min(1)).min(1).max(10).optional(),
  category: z.string().min(1).optional(),
  contents: ExaSearchContentsConfigSchema.optional(),
  endCrawlDate: z.string().optional(),
  endPublishedDate: z.string().optional(),
  excludeDomains: z.array(z.string().min(1)).max(1200).optional(),
  includeDomains: z.array(z.string().min(1)).max(1200).optional(),
  moderation: z.boolean().optional(),
  numResults: z.number().int().min(1).max(100).optional(),
  query: z.string().min(1),
  startCrawlDate: z.string().optional(),
  startPublishedDate: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  type: ExaSearchTypeSchema.optional(),
  userLocation: z.string().length(2).optional(),
})
export type ExaSearchRequest = z.infer<typeof ExaSearchRequestSchema>

export const ExaSearchResultSchema = z.looseObject({
  author: z.string().nullish(),
  favicon: z.string().nullish(),
  highlightScores: z.array(z.number()).optional(),
  highlights: z.array(z.string()).optional(),
  id: z.string(),
  image: z.string().nullish(),
  publishedDate: z.string().nullish(),
  score: z.number().nullish(),
  text: z.string().optional(),
  title: z.string().nullish(),
  url: z.string(),
})
export type ExaSearchResult = z.infer<typeof ExaSearchResultSchema>

const ExaSearchOutputSchema = z.looseObject({
  content: z.unknown(),
  grounding: z
    .array(
      z.looseObject({
        citations: z
          .array(z.looseObject({ title: z.string().optional(), url: z.string() }))
          .optional(),
        confidence: z.enum(['high', 'low', 'medium']).optional(),
        field: z.string().optional(),
      }),
    )
    .optional(),
})

export const ExaSearchResponseSchema = z.looseObject({
  costDollars: z.looseObject({ total: z.number() }).nullish(),
  output: ExaSearchOutputSchema.optional(),
  requestId: z.string().optional(),
  resolvedSearchType: z.string().optional(),
  results: z.array(ExaSearchResultSchema),
  searchType: z.string().optional(),
})
export type ExaSearchResponse = z.infer<typeof ExaSearchResponseSchema>

export interface ExaSearchToolOptions extends ExaClientOptions {
  category?: ExaCategory
  contents?: ExaSearchContentsConfig
  numResults?: number
  type?: ExaSearchType
}

const inputSchema = z.object({
  category: z
    .enum([
      'company',
      'financial report',
      'github',
      'news',
      'pdf',
      'people',
      'personal site',
      'research paper',
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
  userLocation: z
    .string()
    .length(2)
    .optional()
    .describe('Two-letter ISO country code for geographically relevant results, e.g. "US".'),
})

export function exaSearch(options: ExaSearchToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { highlights: true }

  return tool({
    description: 'Search the web with Exa and return ranked sources with token-efficient excerpts.',
    execute: async (input, { abortSignal }) =>
      await client.post(
        '/search',
        ExaSearchRequestSchema.parse({
          category: options.category ?? input.category,
          contents,
          endPublishedDate: input.endPublishedDate,
          excludeDomains: input.excludeDomains,
          includeDomains: input.includeDomains,
          numResults: options.numResults ?? input.numResults ?? 5,
          query: input.query,
          startPublishedDate: input.startPublishedDate,
          type: options.type,
          userLocation: input.userLocation,
        }),
        ExaSearchResponseSchema,
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
