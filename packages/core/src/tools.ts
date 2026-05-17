import type { CredentialId } from '@tetra/credentials'
import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod'

export interface ToolDefinition {
  aiTool: ToolSet[string]
  category: string
  credentialIds: CredentialId[]
  description: string
  label: string
}

// Tool execution context is a capability bag; each tool reads only what it needs.
export const toolRuntimeContextSchema = z
  .object({
    credentials: z.record(z.string(), z.string()).default({}),
  })
  .default({ credentials: {} })

// Jina headers are local to Jina tools instead of shaping the whole registry.
function createJinaHeaders(args: { jinaApiKey?: string; maxTokens: number }): HeadersInit {
  const { jinaApiKey, maxTokens } = args
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Max-Tokens': String(maxTokens),
  }

  if (jinaApiKey === undefined || jinaApiKey === '') {
    return headers
  }

  return { ...headers, Authorization: `Bearer ${jinaApiKey}` }
}

// Registry keys are the canonical tool ids.
const toolRegistry = {
  getCurrentDateTime: {
    aiTool: tool({
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
    category: 'builtin',
    credentialIds: [],
    description: 'Expose the local date, time, locale, and time zone to the model.',
    label: 'Current Date/Time',
  },
  jinaReadUrl: {
    aiTool: tool({
      description: 'Read a URL with Jina Reader and return LLM-friendly markdown.',
      execute: async ({ maxTokens, url }, options) => {
        const context = toolRuntimeContextSchema.parse(options.experimental_context)
        const response = await fetch(`https://r.jina.ai/${url}`, {
          headers: createJinaHeaders({
            jinaApiKey: context.credentials.jinaApiKey,
            maxTokens,
          }),
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
    category: 'web',
    credentialIds: ['JINA_API_KEY'],
    description: 'Fetch one URL through Jina Reader and return markdown for the model.',
    label: 'Web Fetch',
  },
  jinaSearchWeb: {
    aiTool: tool({
      description: 'Search the web with Jina Search and return LLM-friendly markdown results.',
      execute: async ({ maxTokens, query, sites }, options) => {
        const context = toolRuntimeContextSchema.parse(options.experimental_context)
        const searchUrl = new URL(`https://s.jina.ai/${encodeURIComponent(query)}`)
        for (const site of sites ?? []) {
          searchUrl.searchParams.append('site', site)
        }

        const response = await fetch(searchUrl, {
          headers: createJinaHeaders({
            jinaApiKey: context.credentials.jinaApiKey,
            maxTokens,
          }),
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
    category: 'web',
    credentialIds: ['JINA_API_KEY'],
    description: 'Search the web through Jina Search without enabling URL fetching.',
    label: 'Web Search',
  },
} satisfies Record<string, ToolDefinition>

export const toolIds = Object.keys(toolRegistry)
export const toolsRegistryMap = new Map<string, ToolDefinition>(
  Object.entries(toolRegistry).map(([toolId, toolDefinition]) => [toolId, toolDefinition]),
)

// Resolve tool IDs to AI SDK ToolSet and collect required credentials.
// Credentials are provided via a callback so the source (env, localStorage, etc.) is injected.
export function resolveTools(
  requestedToolIds: string[],
  getCredential: (id: string) => string,
): { toolContext: { credentials: Record<string, string> }; tools: ToolSet } {
  const credentialIds = new Set<string>()
  const selectedTools = new Map<string, ToolDefinition>()

  for (const toolId of requestedToolIds) {
    const def = toolsRegistryMap.get(toolId)
    if (def === undefined) {
      console.warn('[tools] unknown tool id ignored:', toolId)
      continue
    }
    for (const credentialId of def.credentialIds) {
      credentialIds.add(credentialId)
    }
    selectedTools.set(toolId, def)
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries loses value type; double cast avoids TS2589 on `as ToolSet` directly.
  const tools = Object.fromEntries(
    [...selectedTools].map(([toolId, def]) => [toolId, def.aiTool]),
  ) as unknown as ToolSet
  const toolContext = {
    credentials: Object.fromEntries([...credentialIds].map((id) => [id, getCredential(id)])),
  }

  return { toolContext, tools }
}
