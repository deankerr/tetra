import { ModelPicker } from '@/components/model-picker'
import { ProviderOptionsEditor } from '@/components/session/provider-options-editor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useDraftCell } from '@/lib/ui'

export function SessionConfig({ sessionId }: { sessionId: string }) {
  // Each cell is an independent subscription — editing one field doesn't re-render others.
  const [modelId, setModelId] = useDraftCell(sessionId, 'modelId')
  const [systemPrompt, setSystemPrompt] = useDraftCell(sessionId, 'systemPrompt')

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPicker className="w-full" onValueChange={setModelId} value={modelId} />
      </Field>
      <Field>
        <FieldTitle>System Prompt</FieldTitle>
        <Textarea
          onChange={(e) => {
            setSystemPrompt(e.currentTarget.value)
          }}
          placeholder="You are a helpful assistant."
          value={systemPrompt}
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
