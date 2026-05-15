import { getCredential } from '@tetra/credentials/store'
import { toolsRegistryMap } from '@tetra/tools/registry'
import type { ToolDefinition } from '@tetra/tools/registry'
import type { ToolSet } from 'ai'

// Resolves tool IDs to AI SDK tool definitions and gathers their required credentials.
export function resolveTools(toolIds: string[]): {
  toolContext: { credentials: Record<string, string> }
  tools: ToolSet
} {
  const credentialIds = new Set<string>()
  const selectedTools = new Map<string, ToolDefinition>()

  for (const rawToolId of toolIds) {
    const toolDefinition = toolsRegistryMap.get(rawToolId)
    if (toolDefinition === undefined) {
      console.warn('[runtime]', 'unknown tool id ignored', { toolId: rawToolId })
      continue
    }
    for (const credentialId of toolDefinition.credentialIds) {
      credentialIds.add(credentialId)
    }
    selectedTools.set(rawToolId, toolDefinition)
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries loses the value type; double cast breaks the deep instantiation TS2589 hits on `as ToolSet` directly.
  const tools = Object.fromEntries(
    [...selectedTools].map(([toolId, def]) => [toolId, def.aiTool]),
  ) as unknown as ToolSet
  const toolContext = {
    credentials: Object.fromEntries([...credentialIds].map((id) => [id, getCredential(id)])),
  }

  return { toolContext, tools }
}
