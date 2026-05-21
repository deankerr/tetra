import { Button } from '@tetra/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'

import { useSessionConfig } from '@/tetra/hooks/sessions'
import { useTetra } from '@/tetra/provider'

import { ModelPicker } from './settings/model-picker'
import { PromptPreviewButton } from './settings/prompt-editor-sheet'
import { ProviderOptionsEditor } from './settings/provider-options-editor'
import { ToolSelector } from './settings/tool-selector'

export function SessionSettings({
  onOpenPromptSheet,
  sessionId,
}: {
  onOpenPromptSheet: () => void
  sessionId: string
}) {
  const { store } = useTetra()
  const config = useSessionConfig(sessionId)

  const updateConfig = (patch: Partial<typeof config>) => {
    store.setSessionConfig(sessionId, { ...store.getSessionConfig(sessionId), ...patch })
  }

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPicker
          className="w-full"
          onValueChange={(modelId) => {
            updateConfig({ modelId })
          }}
          value={config.modelId}
        />
      </Field>

      <Field>
        <FieldTitle>Max Messages</FieldTitle>
        <Input
          min={1}
          onChange={(e) => {
            const val = e.currentTarget.value
            updateConfig({ maxMessages: val === '' ? undefined : Number(val) })
          }}
          placeholder="Unlimited"
          type="number"
          value={config.maxMessages ?? ''}
        />
      </Field>

      <Field>
        <FieldTitle>System Prompt</FieldTitle>
        <PromptPreviewButton onOpen={onOpenPromptSheet} sessionId={sessionId} />
      </Field>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs">Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToolSelector
            onToolIdsChange={(toolIds) => {
              updateConfig({ toolIds })
            }}
            toolIds={config.toolIds ?? []}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs">Provider Options</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderOptionsEditor key={sessionId} sessionId={sessionId} />
        </CardContent>
      </Card>

      <Button
        className="w-full"
        onClick={() => {
          store.setDefaultConfig(store.getSessionConfig(sessionId))
        }}
        variant="outline"
      >
        Use as default for new sessions
      </Button>
    </FieldGroup>
  )
}
