import { toolIds, toolsRegistryMap } from '@tetra/core'
import type { CredentialId } from '@tetra/credentials'
import { getCredentialDefinition } from '@tetra/credentials'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import { Switch } from '@tetra/ui/components/ui/switch'
import { KeyIcon } from 'lucide-react'

import { useHasCredential } from '@/use-credential'

interface ToolSelectorProps {
  onToolIdsChange: (toolIds: string[]) => void
  toolIds: string[]
}

export function ToolSelector({ onToolIdsChange, toolIds: enabledToolIds }: ToolSelectorProps) {
  return (
    <>
      {toolIds.map((toolId) => (
        <ToolToggle
          enabledToolIds={enabledToolIds}
          key={toolId}
          onToolIdsChange={onToolIdsChange}
          toolId={toolId}
        />
      ))}
    </>
  )
}

function ToolToggle({
  enabledToolIds,
  onToolIdsChange,
  toolId,
}: {
  enabledToolIds: string[]
  onToolIdsChange: (toolIds: string[]) => void
  toolId: string
}) {
  const tool = toolsRegistryMap.get(toolId)
  if (tool === undefined) {
    return null
  }

  const checked = enabledToolIds.includes(toolId)

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>{tool.label}</FieldTitle>
        <FieldDescription>
          {tool.credentialIds.length > 0 ? (
            <>
              Uses{' '}
              {tool.credentialIds.map((credentialId) => (
                <ToolCredentialBadge credentialId={credentialId} key={credentialId} />
              ))}
            </>
          ) : null}
        </FieldDescription>
      </FieldContent>
      <Switch
        checked={checked}
        onCheckedChange={(nextChecked) => {
          const nextToolIds = enabledToolIds.filter((enabledToolId) => enabledToolId !== toolId)
          onToolIdsChange(nextChecked ? [...nextToolIds, toolId] : nextToolIds)
        }}
      />
    </Field>
  )
}

function ToolCredentialBadge({ credentialId }: { credentialId: CredentialId }) {
  const hasCredential = useHasCredential(credentialId)
  const definition = getCredentialDefinition(credentialId)

  return (
    <Badge variant={hasCredential ? 'outline' : 'destructive'}>
      <KeyIcon />
      {hasCredential ? definition.label : `${definition.label} missing`}
    </Badge>
  )
}
