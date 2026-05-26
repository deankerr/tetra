import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions } from '../client.ts'

const MAX_RESULTS = 25

const ExaFindSimilarHighlightsOptionsSchema = z.object({
  maxCharacters: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
})

export const ExaFindSimilarContentsConfigSchema = z.object({
  highlights: z.union([z.boolean(), ExaFindSimilarHighlightsOptionsSchema]).optional(),
  livecrawlTimeout: z.number().int().positive().optional(),
  maxAgeHours: z.number().int().min(-1).optional(),
})
export type ExaFindSimilarContentsConfig = z.infer<typeof ExaFindSimilarContentsConfigSchema>

export const ExaFindSimilarRequestSchema = z.object({
  category: z.string().min(1).optional(),
  contents: ExaFindSimilarContentsConfigSchema.optional(),
  excludeDomains: z.array(z.string().min(1)).max(1200).optional(),
  excludeSourceDomain: z.boolean().optional(),
  includeDomains: z.array(z.string().min(1)).max(1200).optional(),
  moderation: z.boolean().optional(),
  numResults: z.number().int().min(1).max(100).optional(),
  url: z.url(),
})
export type ExaFindSimilarRequest = z.infer<typeof ExaFindSimilarRequestSchema>

export const ExaFindSimilarResultSchema = z.looseObject({
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
export type ExaFindSimilarResult = z.infer<typeof ExaFindSimilarResultSchema>

export const ExaFindSimilarResponseSchema = z.looseObject({
  costDollars: z.looseObject({ total: z.number() }).nullish(),
  requestId: z.string().optional(),
  results: z.array(ExaFindSimilarResultSchema),
  searchType: z.string().optional(),
})
export type ExaFindSimilarResponse = z.infer<typeof ExaFindSimilarResponseSchema>

export interface ExaFindSimilarToolOptions extends ExaClientOptions {
  contents?: ExaFindSimilarContentsConfig
  numResults?: number
}

const inputSchema = z.object({
  excludeSourceDomain: z
    .boolean()
    .optional()
    .describe('Exclude results from the same domain as the source URL.'),
  maxAgeHours: z
    .number()
    .int()
    .min(-1)
    .optional()
    .describe('Freshness for returned page contents. 0 always live-crawls, -1 uses cache only.'),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS)
    .optional()
    .describe('Number of results to return.'),
  url: z.url().describe('The URL to find semantically similar pages for.'),
})

export function exaFindSimilar(options: ExaFindSimilarToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { highlights: true }
  const defaultNumResults = options.numResults ?? 5

  return tool({
    description: 'Find web pages semantically similar to a given URL using Exa.',
    execute: async (input, { abortSignal }) =>
      await client.post<ExaFindSimilarResponse>(
        '/findSimilar',
        ExaFindSimilarRequestSchema.parse({
          contents: {
            ...contents,
            maxAgeHours: input.maxAgeHours ?? contents.maxAgeHours,
          },
          excludeSourceDomain: input.excludeSourceDomain,
          numResults: input.numResults ?? defaultNumResults,
          url: input.url,
        }),
        ExaFindSimilarResponseSchema,
        { signal: abortSignal },
      ),
    inputSchema,
  })
}
