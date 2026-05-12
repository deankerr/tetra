import { tool } from 'ai'
import { z } from 'zod'

export type ToolId = 'getCurrentDateTime' | 'jinaReadUrl' | 'jinaSearchWeb'
export type ToolRegistry = ReturnType<typeof createAvailableTools>

export function resolveToolId(toolId: string): ToolId | null {
  if (toolId === 'getCurrentDate') {
    return 'getCurrentDateTime'
  }
  if (toolId === 'getCurrentDateTime' || toolId === 'jinaReadUrl' || toolId === 'jinaSearchWeb') {
    return toolId
  }
  return null
}

function createJinaHeaders(args: { jinaApiKey: string; maxTokens: number }): HeadersInit {
  const { jinaApiKey, maxTokens } = args
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Max-Tokens': String(maxTokens),
  }

  if (jinaApiKey !== '') {
    headers.Authorization = `Bearer ${jinaApiKey}`
  }

  return headers
}

export function createAvailableTools(args: { jinaApiKey: string }) {
  const { jinaApiKey } = args

  return {
    getCurrentDateTime: tool({
      description: 'Get the current local date, time, locale, and time zone.',
      execute: () => {
        const now = new Date()
        const dateTimeFormat = Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
        const { locale, timeZone } = dateTimeFormat.resolvedOptions()

        return {
          iso: now.toISOString(),
          local: dateTimeFormat.format(now),
          locale,
          timeZone,
        }
      },
      inputSchema: z.object({}),
    }),
    jinaReadUrl: tool({
      description: 'Read a URL with Jina Reader and return LLM-friendly markdown.',
      execute: async ({ maxTokens, url }) => {
        const response = await fetch(`https://r.jina.ai/${url}`, {
          headers: createJinaHeaders({ jinaApiKey, maxTokens }),
        })

        if (!response.ok) {
          throw new Error(`Jina Reader failed: ${response.status} ${await response.text()}`)
        }

        return {
          content: await response.text(),
          url,
        }
      },
      inputSchema: z.object({
        maxTokens: z.number().int().min(500).max(20_000).default(6000),
        url: z.url(),
      }),
    }),
    jinaSearchWeb: tool({
      description: 'Search the web with Jina Search and return LLM-friendly markdown results.',
      execute: async ({ maxTokens, query, sites }) => {
        const searchUrl = new URL(`https://s.jina.ai/${encodeURIComponent(query)}`)
        for (const site of sites ?? []) {
          searchUrl.searchParams.append('site', site)
        }

        const response = await fetch(searchUrl, {
          headers: createJinaHeaders({ jinaApiKey, maxTokens }),
        })

        if (!response.ok) {
          throw new Error(`Jina Search failed: ${response.status} ${await response.text()}`)
        }

        return {
          content: await response.text(),
          query,
          sites: sites ?? [],
        }
      },
      inputSchema: z.object({
        maxTokens: z.number().int().min(500).max(20_000).default(6000),
        query: z.string().min(1),
        sites: z.array(z.string().min(1)).optional(),
      }),
    }),
  } satisfies Record<ToolId, unknown>
}
