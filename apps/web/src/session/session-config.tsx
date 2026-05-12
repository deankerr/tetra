import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Switch } from '@tetra/ui/components/ui/switch'
import { Textarea } from '@tetra/ui/components/ui/textarea'

import { ModelPicker } from '@/models/model-picker'
import { useSessionConfig } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'
import { ProviderOptionsEditor } from '@/session/provider-options-editor'

export function SessionConfig({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const config = useSessionConfig(sessionId)
  const currentDateTimeEnabled = config.toolIds.includes('getCurrentDateTime')
  const jinaToolsEnabled =
    config.toolIds.includes('jinaReadUrl') && config.toolIds.includes('jinaSearchWeb')

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPicker
          className="w-full"
          onValueChange={(modelId) => {
            runtime.commands.updateSessionConfig({ patch: { modelId }, sessionId })
          }}
          value={config.modelId}
        />
      </Field>
      <Field>
        <FieldTitle>System Prompt</FieldTitle>
        <Textarea
          onChange={(e) => {
            runtime.commands.updateSessionConfig({
              patch: { systemPrompt: e.currentTarget.value },
              sessionId,
            })
          }}
          placeholder="You are a helpful assistant."
          value={config.systemPrompt ?? ''}
        />
      </Field>
      <Field orientation="horizontal">
        <FieldTitle>Current Date/Time Tool</FieldTitle>
        <Switch
          checked={currentDateTimeEnabled}
          onCheckedChange={(checked) => {
            const toolIds = config.toolIds.filter((toolId) => toolId !== 'getCurrentDateTime')
            runtime.commands.updateSessionConfig({
              patch: { toolIds: checked ? [...toolIds, 'getCurrentDateTime'] : toolIds },
              sessionId,
            })
          }}
        />
      </Field>
      <Field orientation="horizontal">
        <FieldTitle>Jina Web Tools</FieldTitle>
        <Switch
          checked={jinaToolsEnabled}
          onCheckedChange={(checked) => {
            const toolIds = config.toolIds.filter(
              (toolId) => toolId !== 'jinaReadUrl' && toolId !== 'jinaSearchWeb',
            )
            runtime.commands.updateSessionConfig({
              patch: { toolIds: checked ? [...toolIds, 'jinaReadUrl', 'jinaSearchWeb'] : toolIds },
              sessionId,
            })
          }}
        />
      </Field>
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
