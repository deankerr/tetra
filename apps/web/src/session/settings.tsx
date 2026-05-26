import { Button } from '@tetra/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'

import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

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
  const [maxMessages, setMaxMessages] = typedTinybase.useCellState(
    'sessionConfigs',
    sessionId,
    'maxMessages',
  )
  const [modelId, setModelId] = typedTinybase.useCellState('sessionConfigs', sessionId, 'modelId')
  const [toolIds, setToolIds] = typedTinybase.useCellState('sessionConfigs', sessionId, 'toolIds')

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPicker
          className="w-full"
          onValueChange={(nextModelId) => {
            setModelId(nextModelId)
          }}
          value={modelId ?? ''}
        />
      </Field>

      <Field>
        <FieldTitle>Max Messages</FieldTitle>
        <Input
          min={1}
          onChange={(e) => {
            const val = e.currentTarget.value
            setMaxMessages(val === '' ? 0 : Number(val))
          }}
          placeholder="Unlimited"
          type="number"
          value={maxMessages === undefined || maxMessages === 0 ? '' : maxMessages}
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
            onToolIdsChange={(nextToolIds) => {
              setToolIds(nextToolIds)
            }}
            toolIds={toolIds ?? []}
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

      <UseAsDefaultButton sessionId={sessionId} />

      <div className="text-muted-foreground">sessionId: {sessionId}</div>
    </FieldGroup>
  )
}

function UseAsDefaultButton({ sessionId }: { sessionId: string }) {
  const { helpers } = useTetra()

  return (
    <Button
      className="w-full"
      onClick={() => {
        helpers.typedStore.values.defaultSessionConfig.set(
          helpers.typedStore.tables.sessionConfigs.requireEntity(sessionId),
        )
      }}
      variant="outline"
    >
      Use as default for new sessions
    </Button>
  )
}
