import { ModelConfig } from '@tetra/core'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Textarea } from '@tetra/ui/components/ui/textarea'

import { useSessionConfig } from '@/api'
import { ModelPicker } from '@/session/model-picker'
import { ProviderOptionsEditor } from '@/session/provider-options-editor'
import { ToolSelector } from '@/session/tool-selector'
import { useTetra } from '@/tetra-provider'

export function SessionSettings({ sessionId }: { sessionId: string }) {
  const { sessions } = useTetra()
  const config = useSessionConfig(sessionId)

  const updateConfig = (patch: Partial<typeof config>) => {
    const current = sessions.getConfig(sessionId)
    sessions.setConfig(sessionId, ModelConfig.parse({ ...current, ...patch }))
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
        <FieldTitle>System Prompt</FieldTitle>
        <Textarea
          onChange={(e) => {
            updateConfig({ systemPrompt: e.currentTarget.value })
          }}
          placeholder="You are a helpful assistant."
          value={config.systemPrompt ?? ''}
        />
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
          <ProviderOptionsEditor sessionId={sessionId} />
        </CardContent>
      </Card>
    </FieldGroup>
  )
}
