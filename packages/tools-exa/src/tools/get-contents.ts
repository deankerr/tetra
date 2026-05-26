import { tool } from 'ai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { ExaClient } from '../client.ts'
import type { ExaClientOptions } from '../client.ts'

const ExaContentSectionSchema = z.enum([
  'banner',
  'body',
  'footer',
  'header',
  'metadata',
  'navigation',
  'sidebar',
])

const ExaContentsTextOptionsSchema = z.object({
  excludeSections: z.array(ExaContentSectionSchema).optional(),
  includeHtmlTags: z.boolean().optional(),
  includeSections: z.array(ExaContentSectionSchema).optional(),
  maxCharacters: z.number().int().positive().optional(),
  verbosity: z.enum(['compact', 'full', 'standard']).optional(),
})

const ExaContentsHighlightsOptionsSchema = z.object({
  maxCharacters: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
})

const ExaContentsSummaryOptionsSchema = z.object({
  query: z.string().min(1).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
})

export const ExaContentsConfigSchema = z.object({
  extras: z
    .object({
      imageLinks: z.number().int().min(0).optional(),
      links: z.number().int().min(0).optional(),
    })
    .optional(),
  highlights: z.union([z.boolean(), ExaContentsHighlightsOptionsSchema]).optional(),
  livecrawlTimeout: z.number().int().positive().optional(),
  maxAgeHours: z.number().int().min(-1).optional(),
  subpageTarget: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  subpages: z.number().int().min(0).optional(),
  summary: z.union([z.boolean(), ExaContentsSummaryOptionsSchema]).optional(),
  text: z.union([z.boolean(), ExaContentsTextOptionsSchema]).optional(),
})
export type ExaContentsConfig = z.infer<typeof ExaContentsConfigSchema>

export const ExaContentsRequestSchema = ExaContentsConfigSchema.extend({
  ids: z.array(z.string().min(1)).optional(),
  urls: z.array(z.url()).optional(),
}).refine((request) => (request.urls?.length ?? 0) > 0 || (request.ids?.length ?? 0) > 0, {
  message: 'Exa contents requires at least one URL or document ID.',
})
export type ExaContentsRequest = z.infer<typeof ExaContentsRequestSchema>

export const ExaContentsResultSchema = z.looseObject({
  author: z.string().nullish(),
  extras: z
    .looseObject({
      imageLinks: z.array(z.string()).optional(),
      links: z.array(z.string()).optional(),
    })
    .optional(),
  favicon: z.string().nullish(),
  highlightScores: z.array(z.number()).optional(),
  highlights: z.array(z.string()).optional(),
  id: z.string(),
  image: z.string().nullish(),
  publishedDate: z.string().nullish(),
  score: z.number().nullish(),
  subpages: z.array(z.unknown()).optional(),
  summary: z.unknown().optional(),
  text: z.string().optional(),
  title: z.string().nullish(),
  url: z.string(),
})
export type ExaContentsResult = z.infer<typeof ExaContentsResultSchema>

export const ExaContentsResponseSchema = z.looseObject({
  costDollars: z.looseObject({ total: z.number() }).nullish(),
  requestId: z.string().optional(),
  results: z.array(ExaContentsResultSchema),
  statuses: z
    .array(z.looseObject({ id: z.string().optional(), status: z.string().optional() }))
    .optional(),
})
export type ExaContentsResponse = z.infer<typeof ExaContentsResponseSchema>

export interface ExaGetContentsToolOptions extends ExaClientOptions {
  contents?: ExaContentsConfig
}

const inputSchema = z.object({
  maxAgeHours: z
    .number()
    .int()
    .min(-1)
    .optional()
    .describe('Freshness for page contents. 0 always live-crawls, -1 uses cache only.'),
  maxCharacters: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Character cap when full text is requested.'),
  mode: z
    .enum(['highlights', 'summary', 'text'])
    .optional()
    .describe('Content mode. Highlights are best for token-efficient agent workflows.'),
  query: z
    .string()
    .min(1)
    .optional()
    .describe('Focus query for highlights or summary when a specific part of each page matters.'),
  urls: z.array(z.url()).min(1).describe('The page URLs to fetch contents for.'),
})

export function exaGetContents(options: ExaGetContentsToolOptions): Tool {
  const client = new ExaClient(options)
  const contents = options.contents ?? { highlights: true }

  return tool({
    description:
      'Fetch cleaned page content for known URLs using Exa, preferring concise highlights by default.',
    execute: async (input, { abortSignal }) => {
      const mode = input.mode ?? 'highlights'
      const requestContents: ExaContentsConfig = {
        ...contents,
        maxAgeHours: input.maxAgeHours ?? contents.maxAgeHours,
      }

      if (mode === 'text') {
        delete requestContents.highlights
        delete requestContents.summary
        requestContents.text =
          input.maxCharacters === undefined ? true : { maxCharacters: input.maxCharacters }
      }

      if (mode === 'summary') {
        delete requestContents.highlights
        requestContents.summary = input.query === undefined ? true : { query: input.query }
        delete requestContents.text
      }

      if (mode === 'highlights') {
        requestContents.highlights = input.query === undefined ? true : { query: input.query }
        delete requestContents.summary
        delete requestContents.text
      }

      return await client.post<ExaContentsResponse>(
        '/contents',
        ExaContentsRequestSchema.parse({
          ...requestContents,
          urls: input.urls,
        }),
        ExaContentsResponseSchema,
        { signal: abortSignal },
      )
    },
    inputSchema,
  })
}
