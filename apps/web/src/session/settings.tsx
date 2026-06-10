import { Button } from '@tetra/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import { BracesIcon, DownloadIcon } from 'lucide-react'

import { useJsonViewSheet } from '@/components/json-view-sheet'
import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

import { SessionExportButton } from './export-button'
import { ModelPickerButton } from './settings/model-picker'
import { PromptPreviewButton } from './settings/prompt-editor-sheet'
import { ProviderOptionsEditor } from './settings/provider-options-editor'
import { ToolSelector } from './settings/tool-selector'

export function SessionSettings({
  modelId,
  onOpenModelPicker,
  onOpenPromptSheet,
  sessionId,
}: {
  modelId: string
  onOpenModelPicker: () => void
  onOpenPromptSheet: () => void
  sessionId: string
}) {
  const [maxMessages, setMaxMessages] = typedTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'maxMessages',
  )
  const [toolIds, setToolIds] = typedTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'toolIds',
  )

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPickerButton className="w-full" onClick={onOpenModelPicker} value={modelId} />
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

      <SessionSettingsActions sessionId={sessionId} />
    </FieldGroup>
  )
}

function UseAsDefaultButton({ sessionId }: { sessionId: string }) {
  const { helpers } = useTetra()

  return (
    <Button
      className="w-full"
      onClick={() => {
        const config = helpers.typedStore.tables.sessionRunConfigs.getRow(sessionId)
        if (config !== null) {
          helpers.typedStore.values.defaultRunConfig.set(config)
        }
      }}
      variant="outline"
    >
      Use as default for new sessions
    </Button>
  )
}

function SessionSettingsActions({ sessionId }: { sessionId: string }) {
  const session = typedTinybase.useEntity('sessions', sessionId)
  const { openJsonView } = useJsonViewSheet()

  if (session === null) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <Button
        className="w-full"
        onClick={() => {
          openJsonView({ title: `Session: ${session.id}`, value: session })
        }}
        type="button"
        variant="outline"
      >
        <BracesIcon />
        Inspect JSON
      </Button>

      <SessionExportButton
        className="w-full"
        sessionId={sessionId}
        size="default"
        variant="outline"
      >
        <DownloadIcon />
        Export
      </SessionExportButton>
    </div>
  )
}
