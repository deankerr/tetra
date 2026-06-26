import { Button } from '@tetra/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import { BracesIcon, DownloadIcon } from 'lucide-react'

import { useApp } from '@/app'
import { useJsonViewSheet } from '@/components/json-view-sheet'
import { libraryTinybase } from '@/store'

import { SessionExportButton } from './export-button'
import { useRunConfig } from './run-config-providers'
import { ModelPickerButton } from './settings/model-picker'
import { PromptPreviewButton } from './settings/prompt-editor-sheet'
import { ProviderOptionsEditor } from './settings/provider-options-editor'
import { ToolSelector } from './settings/tool-selector'

export function SessionSettings({
  onOpenModelPicker,
  onOpenPromptSheet,
}: {
  onOpenModelPicker: () => void
  onOpenPromptSheet: () => void
}) {
  const { config, updateConfig } = useRunConfig()

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <ModelPickerButton className="w-full" onClick={onOpenModelPicker} value={config.modelId} />
      </Field>

      <Field>
        <FieldTitle>Max Messages</FieldTitle>
        <Input
          min={1}
          onChange={(e) => {
            const val = e.currentTarget.value
            updateConfig({ maxMessages: val === '' ? 0 : Number(val) })
          }}
          placeholder="Unlimited"
          type="number"
          value={config.maxMessages === 0 ? '' : config.maxMessages}
        />
      </Field>

      <Field>
        <FieldTitle>System Prompt</FieldTitle>
        <PromptPreviewButton onOpen={onOpenPromptSheet} />
      </Field>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs">Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToolSelector
            onToolIdsChange={(nextToolIds) => {
              updateConfig({ toolIds: nextToolIds })
            }}
            toolIds={config.toolIds}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs">Provider Options</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderOptionsEditor />
        </CardContent>
      </Card>

      <UseAsDefaultButton />

      <SessionSettingsActions />
    </FieldGroup>
  )
}

function UseAsDefaultButton() {
  const { runConfigs } = useApp()
  const { config } = useRunConfig()

  return (
    <Button
      className="w-full"
      onClick={() => {
        runConfigs.setDefault(config)
      }}
      variant="outline"
    >
      Use as default for new sessions
    </Button>
  )
}

function SessionSettingsActions() {
  const { sessionId } = useRunConfig()
  const session = libraryTinybase.useEntity('sessions', sessionId ?? '')
  const { openJsonView } = useJsonViewSheet()

  if (sessionId === null || session === null) {
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
