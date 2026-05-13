import { credentialsRegistryMap } from '@tetra/credentials/registry'
import { toolIds, toolsRegistryMap } from '@tetra/tools/registry'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import { Switch } from '@tetra/ui/components/ui/switch'

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
          {tool.description}
          {tool.credentialIds.length > 0 ? (
            <>
              {' '}
              Uses{' '}
              {tool.credentialIds
                .map((credentialId) => credentialsRegistryMap.get(credentialId)?.label)
                .filter((label) => label !== undefined)
                .join(', ')}
              .
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
