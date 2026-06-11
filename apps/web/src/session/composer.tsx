import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@tetra/ui/components/ai-elements/attachments'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@tetra/ui/components/ai-elements/prompt-input'
import { toast } from '@tetra/ui/components/ui/sonner'
import type { UIMessage } from 'ai'
import { ArrowUpFromDot, ImageIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { typedTinybase } from '@/lib/tinybase'
import { ModelPickerButton, ModelPickerSheet } from '@/session/settings/model-picker'
import { useTetra } from '@/tetra-context'

import { useSessionThreadAppendTarget } from './thread-view'
import { SessionUsageMeter } from './usage-meter'

const activeStatuses = new Set(['preparing', 'streaming'])

type ComposerSubmitHandler = NonNullable<Parameters<typeof PromptInput>[0]['onSubmit']>

export function Composer({
  className,
  onSessionMaterialized,
  requireGenerateReady,
  sessionId,
}: {
  className?: string
  onSessionMaterialized?: (args: { sessionId: string }) => void
  requireGenerateReady?: () => void
  sessionId: string
}) {
  const activeRun = useActiveRun(sessionId)
  const isStreaming = activeRun !== null
  const [modelId, setModelId] = typedTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'modelId',
  )
  const [draft, setDraft] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const handleSubmit = useComposerSubmit({
    isStreaming,
    onSessionMaterialized,
    requireGenerateReady,
    sessionId,
    setDraft,
  })

  return (
    <>
      <PromptInput accept="image/*" className={className} multiple onSubmit={handleSubmit}>
        <PromptInputBody>
          <ComposerAttachments />
          <PromptInputTextarea
            disabled={isStreaming}
            onChange={(e) => {
              setDraft(e.currentTarget.value)
            }}
            placeholder="Where do you want to go today?"
            value={draft}
            className="min-h-14 md:text-sm"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelPickerButton
              onClick={() => {
                setModelPickerOpen(true)
              }}
              value={modelId ?? ''}
            />
            <ImageInputButton disabled={isStreaming} />
          </PromptInputTools>

          <ComposerSubmitControls
            activeRunId={activeRun?.id ?? null}
            draft={draft}
            isStreaming={isStreaming}
            sessionId={sessionId}
          />
        </PromptInputFooter>
      </PromptInput>
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          setModelId(nextModelId)
        }}
        open={modelPickerOpen}
        value={modelId ?? ''}
      />
    </>
  )
}

function useComposerSubmit({
  isStreaming,
  onSessionMaterialized,
  requireGenerateReady,
  sessionId,
  setDraft,
}: {
  isStreaming: boolean
  onSessionMaterialized: ((args: { sessionId: string }) => void) | undefined
  requireGenerateReady: (() => void) | undefined
  sessionId: string
  setDraft: (draft: string) => void
}): ComposerSubmitHandler {
  const tetra = useTetra()
  const { selectThreadFromMessage, threadLeafMessageId } = useSessionThreadAppendTarget(sessionId)

  return useCallback<ComposerSubmitHandler>(
    (message, event) => {
      const text = message.text.trim()
      const parts: UIMessage['parts'] = [
        ...(text === '' ? [] : [{ text, type: 'text' } satisfies UIMessage['parts'][number]]),
        ...message.files,
      ]

      if (isStreaming || parts.length === 0) {
        return
      }

      const submitter =
        event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
      const isAdd = submitter instanceof HTMLElement && submitter.dataset.action === 'add'
      const session = tetra.transcripts.getSession(sessionId)
      const shouldSetTitle = tetra.typedStore.tables.sessions.requireEntity(sessionId).title === ''

      if (isAdd) {
        // Add-only submits append committed content without starting model inference.
        const messageId = session.appendMessage({
          parentMessageId: threadLeafMessageId,
          parts,
          role: 'user',
        })
        selectThreadFromMessage(messageId)
        if (shouldSetTitle) {
          tetra.typedStore.tables.sessions.updateRow(sessionId, {
            title: text === '' ? 'Image' : text.slice(0, 60),
            updatedAt: Date.now(),
          })
        }
        setDraft('')
        onSessionMaterialized?.({ sessionId })
        return
      }

      // Send can be preflighted by the surrounding view before any transcript rows exist.
      requireGenerateReady?.()

      try {
        // Create user and assistant messages, then hand off to the run.
        const userMessageId = session.appendMessage({
          parentMessageId: threadLeafMessageId,
          parts,
          role: 'user',
        })
        const targetMessageId = session.appendMessage({
          parentMessageId: userMessageId,
          parts: [],
          role: 'assistant',
        })
        tetra.runs.generate({ targetMessageId })
        selectThreadFromMessage(targetMessageId)
        if (shouldSetTitle) {
          tetra.typedStore.tables.sessions.updateRow(sessionId, {
            title: text === '' ? 'Image' : text.slice(0, 60),
            updatedAt: Date.now(),
          })
        }
        setDraft('')
        onSessionMaterialized?.({ sessionId })
      } catch (error) {
        toast.error('Could not generate response', {
          description: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
    [
      isStreaming,
      onSessionMaterialized,
      requireGenerateReady,
      selectThreadFromMessage,
      sessionId,
      setDraft,
      tetra,
      threadLeafMessageId,
    ],
  )
}

// Returns the current active run for this composer so submit controls stay in sync.
const useActiveRun = (sessionId: string) => {
  const ids = typedTinybase.useSliceRowIds('runsBySessionNewestFirst', sessionId)
  const run = typedTinybase.useEntity('runs', ids[0] ?? '')
  if (run === null || !activeStatuses.has(run.status)) {
    return null
  }
  return run
}

function ComposerAttachments() {
  const attachments = usePromptInputAttachments()

  if (attachments.files.length === 0) {
    return null
  }

  return (
    <Attachments className="px-2 pt-2" variant="grid">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => {
            attachments.remove(attachment.id)
          }}
        >
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  )
}

function ImageInputButton({ disabled }: { disabled: boolean }) {
  const attachments = usePromptInputAttachments()

  return (
    <PromptInputButton
      aria-label="Add image"
      disabled={disabled}
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title="Add image"
      type="button"
    >
      <ImageIcon className="size-4" />
    </PromptInputButton>
  )
}

function ComposerSubmitControls({
  activeRunId,
  draft,
  isStreaming,
  sessionId,
}: {
  activeRunId: string | null
  draft: string
  isStreaming: boolean
  sessionId: string
}) {
  const tetra = useTetra()
  const attachments = usePromptInputAttachments()
  const isEmpty = draft.trim() === '' && attachments.files.length === 0

  return (
    <div className="flex items-center gap-1">
      <SessionUsageMeter sessionId={sessionId} />

      <PromptInputButton
        aria-label="Add"
        data-action="add"
        disabled={!isStreaming && isEmpty}
        size="icon-sm"
        title="Add"
        type="submit"
        variant="secondary"
      >
        <ArrowUpFromDot className="size-4" />
      </PromptInputButton>

      <PromptInputSubmit
        disabled={!isStreaming && isEmpty}
        onStop={() => {
          if (activeRunId !== null) {
            tetra.runs.cancel(activeRunId)
          }
        }}
        status={isStreaming ? 'streaming' : 'ready'}
      />
    </div>
  )
}
