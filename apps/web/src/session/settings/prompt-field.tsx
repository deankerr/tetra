import { RequestConfig } from '@tetra/core-redesign'
import { Button } from '@tetra/ui/components/ui/button'
import { Field, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tetra/ui/components/ui/select'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { Textarea } from '@tetra/ui/components/ui/textarea'
import { Trash2Icon, XIcon } from 'lucide-react'

import { usePrompt, usePromptIds } from '@/tetra/hooks/prompts'
import { useSessionConfig } from '@/tetra/hooks/sessions'
import { useTetra } from '@/tetra/provider'
import { tinybase } from '@/tetra/tinybase'

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
        <Textarea className="flex-1" disabled placeholder="No system prompt" value="" />
      </>
    )
  }

  return <PromptCellFields onDelete={onDelete} promptId={promptId} />
}

function PromptCellFields({ onDelete, promptId }: { onDelete: () => void; promptId: string }) {
  const [content, setContent] = tinybase.useCellState('prompts', promptId, 'content')
  const [label, setLabel] = tinybase.useCellState('prompts', promptId, 'label')

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
        className="flex-1"
        onChange={(e) => {
          setContent(e.currentTarget.value)
        }}
        placeholder="System instructions for this session"
        value={content ?? ''}
      />
    </>
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

/** 3-line preview in the settings panel. Calls onOpen to open the dedicated editor sheet. */
export function SystemPromptField({
  onOpen,
  sessionId,
}: {
  onOpen: () => void
  sessionId: string
}) {
  const config = useSessionConfig(sessionId)
  const promptIds = usePromptIds()
  const selectedPromptId =
    config.systemPromptId !== undefined && promptIds.includes(config.systemPromptId)
      ? config.systemPromptId
      : undefined

  // Always call — hook handles missing id gracefully
  const selectedPrompt = usePrompt(selectedPromptId ?? '')
  const previewContent = selectedPrompt?.content?.trim() ?? ''

  return (
    <Field>
      <FieldTitle>System Prompt</FieldTitle>
      <button
        className="border-input bg-input/30 hover:bg-input/50 w-full rounded-md border px-3 py-2 text-left text-xs transition-colors"
        onClick={onOpen}
        type="button"
      >
        {previewContent ? (
          <span className="line-clamp-3 whitespace-pre-wrap">{previewContent}</span>
        ) : (
          <span className="text-muted-foreground">No system prompt</span>
        )}
      </button>
    </Field>
  )
}

/**
 * Full system prompt editor in a dedicated sheet.
 * Rendered as a sibling to the settings sheet (not nested inside it) so that
 * base-ui's outside-click dismissal works correctly without React portal event bubbling interference.
 */
export function SystemPromptSheet({
  onOpenChange,
  open,
  sessionId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  sessionId: string
}) {
  const { store } = useTetra()
  const config = useSessionConfig(sessionId)
  const promptIds = usePromptIds()
  const selectedPromptId =
    config.systemPromptId !== undefined && promptIds.includes(config.systemPromptId)
      ? config.systemPromptId
      : undefined

  const updateSystemPromptId = (systemPromptId?: string) => {
    const { systemPromptId: _removed, ...rest } = store.getSessionConfig(sessionId)
    store.setSessionConfig(
      sessionId,
      RequestConfig.parse(systemPromptId === undefined ? rest : { ...rest, systemPromptId }),
    )
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex flex-col"
        showCloseButton={false}
        style={{ maxWidth: '480px', width: '480px' }}
      >
        <div className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-2">
          <span className="px-2 text-xs font-medium">System Prompt</span>
          <SheetClose render={<Button size="icon-sm" variant="ghost" />}>
            <XIcon />
          </SheetClose>
        </div>

        {/* Prompt selector */}
        <div className="shrink-0 border-b p-4">
          <Select
            onValueChange={(value) => {
              if (value === null) {
                updateSystemPromptId()
                return
              }
              if (value === NEW_PROMPT_VALUE) {
                updateSystemPromptId(store.createPrompt())
                return
              }
              updateSystemPromptId(value === NO_PROMPT_VALUE ? undefined : value)
            }}
            value={selectedPromptId ?? NO_PROMPT_VALUE}
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
        </div>

        {/* Prompt fields — fill remaining height */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <SelectedPromptFields
            onDelete={() => {
              if (selectedPromptId !== undefined) {
                store.deletePrompt(selectedPromptId)
              }
            }}
            promptId={selectedPromptId}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
