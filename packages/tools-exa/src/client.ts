import { z } from 'zod'

const DEFAULT_BASE_URL = 'https://api.exa.ai'

export interface ExaClientOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export interface ExaRequestOptions {
  signal?: AbortSignal
}

export type ExaLivecrawl = 'always' | 'fallback' | 'never' | 'preferred'
export type ExaSearchType = 'auto' | 'deep' | 'deep-lite' | 'deep-reasoning' | 'fast' | 'instant'

export interface ExaTextOptions {
  includeHtmlTags?: boolean
  maxCharacters?: number
}

export interface ExaHighlightsOptions {
  highlightsPerUrl?: number
  numSentences?: number
  query?: string
}

export interface ExaSummaryOptions {
  query?: string
}

export interface ExaContentsConfig {
  highlights?: ExaHighlightsOptions
  livecrawl?: ExaLivecrawl
  livecrawlTimeout?: number
  subpageTarget?: string | string[]
  subpages?: number
  summary?: ExaSummaryOptions
  text?: ExaTextOptions | boolean
}

export interface ExaSearchRequest {
  category?: string
  contents?: ExaContentsConfig
  endCrawlDate?: string
  endPublishedDate?: string
  excludeDomains?: string[]
  excludeText?: string[]
  includeDomains?: string[]
  includeText?: string[]
  numResults?: number
  query: string
  startCrawlDate?: string
  startPublishedDate?: string
  type?: ExaSearchType
  userLocation?: string
}

export interface ExaFindSimilarRequest {
  category?: string
  contents?: ExaContentsConfig
  excludeDomains?: string[]
  excludeSourceDomain?: boolean
  includeDomains?: string[]
  numResults?: number
  url: string
}

export interface ExaContentsRequest extends ExaContentsConfig {
  ids?: string[]
  urls?: string[]
}

export interface ExaAnswerRequest {
  model?: 'exa' | 'exa-pro'
  query: string
  text?: boolean
}

const CostDollarsSchema = z.looseObject({ total: z.number() })

export const ExaResultSchema = z.looseObject({
  author: z.string().nullish(),
  favicon: z.string().nullish(),
  highlightScores: z.array(z.number()).optional(),
  highlights: z.array(z.string()).optional(),
  id: z.string(),
  image: z.string().nullish(),
  publishedDate: z.string().nullish(),
  score: z.number().nullish(),
  summary: z.string().optional(),
  text: z.string().optional(),
  title: z.string().nullish(),
  url: z.string(),
})
export type ExaResult = z.infer<typeof ExaResultSchema>

const ExaStatusSchema = z.looseObject({
  id: z.string().optional(),
  status: z.string().optional(),
})

const ExaSearchResponseSchema = z.looseObject({
  costDollars: CostDollarsSchema.nullish(),
  requestId: z.string().optional(),
  resolvedSearchType: z.string().optional(),
  results: z.array(ExaResultSchema),
  searchTime: z.number().optional(),
})
export type ExaSearchResponse = z.infer<typeof ExaSearchResponseSchema>

const ExaContentsResponseSchema = z.looseObject({
  costDollars: CostDollarsSchema.nullish(),
  requestId: z.string().optional(),
  results: z.array(ExaResultSchema),
  statuses: z.array(ExaStatusSchema).optional(),
})
export type ExaContentsResponse = z.infer<typeof ExaContentsResponseSchema>

const ExaAnswerResponseSchema = z.looseObject({
  answer: z.string(),
  citations: z.array(ExaResultSchema).default([]),
  costDollars: CostDollarsSchema.nullish(),
})
export type ExaAnswerResponse = z.infer<typeof ExaAnswerResponseSchema>

export class ExaClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: ExaClientOptions) {
    if (options.apiKey === '') {
      throw new Error('[tools-exa] An Exa API key is required.')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async answer(request: ExaAnswerRequest, options?: ExaRequestOptions): Promise<ExaAnswerResponse> {
    return await this.post('/answer', request, ExaAnswerResponseSchema, options)
  }

  async findSimilar(
    request: ExaFindSimilarRequest,
    options?: ExaRequestOptions,
  ): Promise<ExaSearchResponse> {
    return await this.post('/findSimilar', request, ExaSearchResponseSchema, options)
  }

  async getContents(
    request: ExaContentsRequest,
    options?: ExaRequestOptions,
  ): Promise<ExaContentsResponse> {
    return await this.post('/contents', request, ExaContentsResponseSchema, options)
  }

  async search(request: ExaSearchRequest, options?: ExaRequestOptions): Promise<ExaSearchResponse> {
    return await this.post('/search', request, ExaSearchResponseSchema, options)
  }

  private async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ExaRequestOptions,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      method: 'POST',
      signal: options?.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(
        `[tools-exa] ${path} request failed (${response.status} ${response.statusText}): ${detail}`,
      )
    }

    return schema.parse(await response.json())
  }
}
