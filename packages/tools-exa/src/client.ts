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
    this.fetchJson = up(options.fetchImpl ?? fetch, () => ({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      headers: {
        'x-api-key': options.apiKey,
      },
      parseRejected: async (response) => {
        let data: unknown

        try {
          data = await response.clone().json()
        } catch {
          data = await response.text()
        }

        return new ResponseError({
          data,
          message: `[tools-exa] ${response.url} failed (${response.status} ${response.statusText})`,
          status: response.status,
        })
      },
      retry: options.retry,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    }))
  }

  async post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options?: ExaRequestOptions,
  ): Promise<T> {
    return await this.fetchJson(path, {
      body,
      method: 'POST',
      schema,
      signal: options?.signal,
    })
  }
}
