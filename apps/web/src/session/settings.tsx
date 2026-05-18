import { ModelConfig } from '@tetra/core'
import type { TetraSchemas } from '@tetra/core'
import { Button } from '@tetra/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@tetra/ui/components/ui/card'
import { Field, FieldGroup, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tetra/ui/components/ui/select'
import { Textarea } from '@tetra/ui/components/ui/textarea'
import { Trash2Icon } from 'lucide-react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { usePrompt, usePromptIds, useSessionConfig } from '@/api'
import { ModelPicker } from '@/session/model-picker'
import { ProviderOptionsEditor } from '@/session/provider-options-editor'
import { ToolSelector } from '@/session/tool-selector'
import { useTetra } from '@/tetra-provider'

// Schema-aware TinyBase React hooks for direct prompt cell editing.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<TetraSchemas>

const NO_PROMPT_VALUE = '__none__'
const NEW_PROMPT_VALUE = '__new__'

function PromptDisplayLabel({ prompt }: { prompt: { content: string; label: string } }) {
  const explicit = prompt.label.trim()
  if (explicit) {
    return explicit
  }

  const content = prompt.content.trim()
  if (!content) {
    return <span className="text-muted-foreground">Blank Prompt</span>
  }

  return content.length > 60 ? `${content.slice(0, 57)}...` : content
}

function PromptOption({ promptId }: { promptId: string }) {
  const prompt = usePrompt(promptId)
  if (prompt === null) {
    return null
  }

  return (
    <SelectItem value={promptId}>
      <PromptDisplayLabel prompt={prompt} />
    </SelectItem>
  )
}

function SelectedPromptFields({
  onDelete,
  promptId,
}: {
  onDelete: () => void
  promptId: string | undefined
}) {
  if (promptId === undefined) {
    return (
      <>
        <div className="flex gap-2">
          <Input disabled placeholder="No prompt selected" />
          <Button disabled size="icon" variant="ghost" title="Delete prompt">
            <Trash2Icon />
          </Button>
        </div>
        <Textarea disabled placeholder="No system prompt" value="" />
      </>
    )
  }

  return <PromptCellFields onDelete={onDelete} promptId={promptId} />
}

function PromptCellFields({ onDelete, promptId }: { onDelete: () => void; promptId: string }) {
  const [content, setContent] = store.useCellState('prompts', promptId, 'content')
  const [label, setLabel] = store.useCellState('prompts', promptId, 'label')

  return (
    <>
      <div className="flex gap-2">
        <Input
          onChange={(e) => {
            setLabel(e.currentTarget.value)
          }}
          placeholder="Label"
          value={label ?? ''}
        />
        <Button onClick={onDelete} size="icon" variant="ghost" title="Delete prompt">
          <Trash2Icon />
        </Button>
      </div>
      <Textarea
        onChange={(e) => {
          setContent(e.currentTarget.value)
        }}
        placeholder="System instructions for this session"
        value={content ?? ''}
      />
    </>
  )
}

export function SessionSettings({ sessionId }: { sessionId: string }) {
  const { prompts, sessions } = useTetra()
  const config = useSessionConfig(sessionId)
  const promptIds = usePromptIds()
  const selectedPromptId =
    config.systemPromptId !== undefined && promptIds.includes(config.systemPromptId)
      ? config.systemPromptId
      : undefined

  const updateConfig = (patch: Partial<typeof config>) => {
    const current = sessions.getConfig(sessionId)
    const next = { ...current, ...patch }
    if ('systemPromptId' in patch && patch.systemPromptId === undefined) {
      delete next.systemPromptId
    }
    sessions.setConfig(sessionId, ModelConfig.parse(next))
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
        <Select
          value={selectedPromptId ?? NO_PROMPT_VALUE}
          onValueChange={(value) => {
            if (value === null) {
              updateConfig({ systemPromptId: undefined })
              return
            }
            if (value === NEW_PROMPT_VALUE) {
              updateConfig({ systemPromptId: prompts.create() })
              return
            }
            updateConfig({ systemPromptId: value === NO_PROMPT_VALUE ? undefined : value })
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedPromptId === undefined ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <PromptLabel promptId={selectedPromptId} />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROMPT_VALUE}>
              <span className="text-muted-foreground">None</span>
            </SelectItem>
            {promptIds.map((promptId) => (
              <PromptOption key={promptId} promptId={promptId} />
            ))}
            <SelectItem value={NEW_PROMPT_VALUE}>+ New</SelectItem>
          </SelectContent>
        </Select>
        <SelectedPromptFields
          promptId={selectedPromptId}
          onDelete={() => {
            if (selectedPromptId !== undefined) {
              prompts.delete(selectedPromptId)
            }
          }}
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

function PromptLabel({ promptId }: { promptId: string }) {
  const prompt = usePrompt(promptId)
  return prompt === null ? (
    <span className="text-muted-foreground">None</span>
  ) : (
    <PromptDisplayLabel prompt={prompt} />
  )
}
