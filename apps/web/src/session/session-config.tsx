import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Textarea } from '@tetra/ui/components/ui/textarea'

import { ModelPicker } from '@/models/model-picker'
import { useSessionConfig } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'
import { ProviderOptionsEditor } from '@/session/provider-options-editor'

export function SessionConfig({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const config = useSessionConfig(sessionId)

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
