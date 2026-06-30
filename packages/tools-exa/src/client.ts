import { ResponseError, up } from 'up-fetch'
import type { RetryOptions, UpFetch } from 'up-fetch'
import type { z } from 'zod'

const DEFAULT_BASE_URL = 'https://api.exa.ai'
const DEFAULT_TIMEOUT_MS = 30_000

export interface ExaClientOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  retry?: RetryOptions
  timeout?: number
}

export interface ExaRequestOptions {
  signal?: AbortSignal
}

export class ExaClient {
  private readonly fetchJson: UpFetch

  constructor(options: ExaClientOptions) {
    // Build request defaults per call so future credential or endpoint changes have one boundary.
    this.fetchJson = up(options.fetchImpl ?? fetch, () => {
      const defaults = {
        baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
        headers: {
          'x-api-key': options.apiKey,
        },
        parseRejected: async (response: Response) => {
          let data: unknown

          try {
            data = await response.clone().json()
          } catch {
            data = await response.text()
          }

          const responseError =
            typeof data === 'object' &&
            data !== null &&
            'error' in data &&
            typeof data.error === 'string'
              ? `: ${data.error}`
              : ''

          return new ResponseError({
            data,
            message: `[tools-exa] ${response.url} failed (${response.status} ${response.statusText})${responseError}`,
            status: response.status,
          })
        },
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      }

      if (options.retry === undefined) {
        return defaults
      }

      return { ...defaults, retry: options.retry }
    })
  }

  async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ExaRequestOptions,
  ): Promise<T> {
    const request = {
      body,
      method: 'POST',
      schema,
    } as const

    if (options?.signal === undefined) {
      return await this.fetchJson(path, request)
    }

    return await this.fetchJson(path, { ...request, signal: options.signal })
  }
}
