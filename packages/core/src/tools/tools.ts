import { webSearch } from '@exalabs/ai-sdk'
import type { CredentialId } from '@tetra/credentials'
import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod'

export interface ToolDefinition {
  category: string
  createTool: (credentials: Record<string, string>) => ToolSet[string]
  credentialIds: CredentialId[]
  description: string
  label: string
}

function createJinaHeaders(args: { jinaApiKey: string; maxTokens: number }): HeadersInit {
  const { jinaApiKey, maxTokens } = args
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Max-Tokens': String(maxTokens),
  }

  if (jinaApiKey === '') {
    return headers
  }

  return { ...headers, Authorization: `Bearer ${jinaApiKey}` }
}

const toolRegistry = {
  exaSearchWeb: {
    category: 'web',
    createTool: ({ EXA_API_KEY }) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- webSearch compiled against an older ai version missing the onInputAvailable/onInputStart/onInputDelta Pick intersection; structurally compatible at runtime.
      webSearch({ apiKey: EXA_API_KEY, numResults: 5 }) as unknown as ToolSet[string],
    credentialIds: ['EXA_API_KEY'],
    description: 'Search the web using Exa neural search and return full content results.',
    label: 'Exa Web Search',
  },
  getCurrentDateTime: {
    category: 'builtin',
    createTool: () =>
      tool({
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
    credentialIds: [],
    description: 'Expose the local date, time, locale, and time zone to the model.',
    label: 'Current Date/Time',
  },
  jinaReadUrl: {
    category: 'web',
    createTool: ({ JINA_API_KEY }) =>
      tool({
        description: 'Read a URL with Jina Reader and return LLM-friendly markdown.',
        execute: async ({ maxTokens, url }) => {
          const response = await fetch(`https://r.jina.ai/${url}`, {
            headers: createJinaHeaders({ jinaApiKey: JINA_API_KEY, maxTokens }),
          })

          if (!response.ok) {
            throw new Error(`Jina Reader failed: ${response.status} ${await response.text()}`)
          }

          return { content: await response.text(), url }
        },
        inputSchema: z.object({
          maxTokens: z.number().int().min(500).max(20_000).default(6000),
          url: z.url(),
        }),
      }),
    credentialIds: ['JINA_API_KEY'],
    description: 'Fetch one URL through Jina Reader and return markdown for the model.',
    label: 'Web Fetch',
  },
  jinaSearchWeb: {
    category: 'web',
    createTool: ({ JINA_API_KEY }) =>
      tool({
        description: 'Search the web with Jina Search and return LLM-friendly markdown results.',
        execute: async ({ maxTokens, query, sites }) => {
          const searchUrl = new URL(`https://s.jina.ai/${encodeURIComponent(query)}`)
          for (const site of sites ?? []) {
            searchUrl.searchParams.append('site', site)
          }

          const response = await fetch(searchUrl, {
            headers: createJinaHeaders({ jinaApiKey: JINA_API_KEY, maxTokens }),
          })

          if (!response.ok) {
            throw new Error(`Jina Search failed: ${response.status} ${await response.text()}`)
          }

          return { content: await response.text(), query, sites: sites ?? [] }
        },
        inputSchema: z.object({
          maxTokens: z.number().int().min(500).max(20_000).default(6000),
          query: z.string().min(1),
          sites: z.array(z.string().min(1)).optional(),
        }),
      }),
    credentialIds: ['JINA_API_KEY'],
    description: 'Search the web through Jina Search without enabling URL fetching.',
    label: 'Web Search',
  },
} satisfies Record<string, ToolDefinition>

export const toolIds = Object.keys(toolRegistry)
export const toolsRegistryMap = new Map<string, ToolDefinition>(
  Object.entries(toolRegistry).map(([toolId, toolDefinition]) => [toolId, toolDefinition]),
)

export function resolveTools(
  requestedToolIds: string[],
  getCredential: (id: string) => string,
): ToolSet {
  const tools: ToolSet = {}

  for (const toolId of requestedToolIds) {
    const def = toolsRegistryMap.get(toolId)
    if (def === undefined) {
      console.warn('[tools] unknown tool id ignored:', toolId)
      continue
    }

    const credentials = Object.fromEntries(def.credentialIds.map((id) => [id, getCredential(id)]))
    tools[toolId] = def.createTool(credentials)
  }

  return tools
}
