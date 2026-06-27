import type { CredentialId } from '@tetra/credentials'
import { getCredentialDefinition } from '@tetra/credentials'
import { exaToolDescriptors } from '@tetra/tools-exa'
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

const exaToolDefinitions = exaToolDescriptors.map((descriptor): [string, ToolDefinition] => [
  descriptor.id,
  {
    category: 'web',
    createTool: ({ EXA_API_KEY }) => descriptor.createTool({ apiKey: EXA_API_KEY }),
    credentialIds: ['EXA_API_KEY'],
    description: descriptor.description,
    label: descriptor.label,
  },
])

const toolRegistry: Record<string, ToolDefinition> = {
  ...Object.fromEntries(exaToolDefinitions),
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
}

export const toolIds = Object.keys(toolRegistry)
export const toolsRegistryMap = new Map<string, ToolDefinition>(Object.entries(toolRegistry))

export function resolveTools(
  requestedToolIds: string[],
  getCredential: (id: CredentialId) => string | undefined,
): ToolSet {
  const tools: ToolSet = {}

  for (const toolId of requestedToolIds) {
    const def = toolsRegistryMap.get(toolId)
    if (def === undefined) {
      console.warn('[tools] unknown tool id ignored:', toolId)
      continue
    }

    const credentials: Record<string, string> = {}
    const missingCredentialIds: CredentialId[] = []
    for (const id of def.credentialIds) {
      const value = getCredential(id)
      if (value === undefined) {
        missingCredentialIds.push(id)
        continue
      }
      credentials[id] = value
    }

    if (missingCredentialIds.length > 0) {
      const labels = missingCredentialIds.map((id) => getCredentialDefinition(id).label).join(', ')
      throw new Error(`${def.label} requires ${labels}`)
    }

    tools[toolId] = def.createTool(credentials)
  }

  return tools
}
