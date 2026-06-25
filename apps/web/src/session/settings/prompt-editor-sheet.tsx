import { Button } from '@tetra/ui/components/ui/button'
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
import { useMemo } from 'react'

import { useApp } from '@/app'
import { libraryTinybase } from '@/store'

const usePromptIds = () => {
  const prompts = libraryTinybase.useEntityList('prompts')
  return useMemo(
    () =>
      prompts.toSorted((left, right) => left.id.localeCompare(right.id)).map((prompt) => prompt.id),
    [prompts],
  )
}

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
  const prompt = libraryTinybase.useEntity('prompts', promptId)
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
          <Button
            aria-label="Delete prompt"
            disabled
            size="icon"
            title="Delete prompt"
            variant="ghost"
          >
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
  const [content, setContent] = libraryTinybase.useCellState('prompts', promptId, 'content')
  const [label, setLabel] = libraryTinybase.useCellState('prompts', promptId, 'label')

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
        <Button
          aria-label="Delete prompt"
          onClick={onDelete}
          size="icon"
          title="Delete prompt"
          variant="ghost"
        >
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
  const prompt = libraryTinybase.useEntity('prompts', promptId)
  return prompt === null ? (
    <span className="text-muted-foreground">None</span>
  ) : (
    <PromptDisplayLabel prompt={prompt} />
  )
}

/** 3-line preview in the settings panel. Calls onOpen to open the dedicated editor sheet. */
export function PromptPreviewButton({
  onOpen,
  sessionId,
}: {
  onOpen: () => void
  sessionId: string
}) {
  const promptIds = usePromptIds()
  const systemPromptId = libraryTinybase.useCell('sessionRunConfigs', sessionId, 'systemPromptId')
  const selectedPromptId =
    systemPromptId !== undefined && systemPromptId !== '' && promptIds.includes(systemPromptId)
      ? systemPromptId
      : undefined

  const selectedPrompt = libraryTinybase.useEntity('prompts', selectedPromptId ?? '')
  const previewContent = selectedPrompt?.content?.trim() ?? ''

  return (
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
  )
}

/**
 * Full system prompt editor in a dedicated sheet.
 * Rendered as a sibling to the settings sheet (not nested inside it) so that
 * base-ui's outside-click dismissal works correctly without React portal event bubbling interference.
 */
export function PromptEditorSheet({
  onOpenChange,
  open,
  sessionId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  sessionId: string
}) {
  const { prompts } = useApp()
  const [systemPromptId, setSystemPromptId] = libraryTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'systemPromptId',
  )
  const promptIds = usePromptIds()
  const selectedPromptId =
    systemPromptId !== undefined && systemPromptId !== '' && promptIds.includes(systemPromptId)
      ? systemPromptId
      : undefined

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex flex-col"
        showCloseButton={false}
        style={{ maxWidth: 'none', width: 'min(90vw, 1120px)' }}
      >
        <div className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-2">
          <span className="px-2 text-xs font-medium">System Prompt</span>
          <SheetClose
            render={
              <Button
                aria-label="Close system prompt editor"
                size="icon-sm"
                title="Close system prompt editor"
                variant="ghost"
              />
            }
          >
            <XIcon />
          </SheetClose>
        </div>

        {/* Prompt selector */}
        <div className="shrink-0 border-b p-4">
          <Select
            onValueChange={(value) => {
              if (value === null) {
                setSystemPromptId('')
                return
              }
              if (value === NEW_PROMPT_VALUE) {
                setSystemPromptId(prompts.createPrompt())
                return
              }
              setSystemPromptId(value === NO_PROMPT_VALUE ? '' : value)
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
                prompts.deletePrompt(selectedPromptId)
              }
            }}
            promptId={selectedPromptId}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
