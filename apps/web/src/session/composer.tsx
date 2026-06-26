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

import { useApp } from '@/app'
import { ModelPickerButton, ModelPickerSheet } from '@/session/settings/model-picker'
import { libraryTinybase } from '@/store'

import { useSessionThreadAppendTarget } from './thread-view'
import { SessionUsageMeter } from './usage-meter'

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
  const isActive = activeRun !== null
  const [modelId, setModelId] = libraryTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'modelId',
  )
  const [draft, setDraft] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const handleSubmit = useComposerSubmit({
    isActive,
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
            disabled={isActive}
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
              className="text-foreground"
              onClick={() => {
                setModelPickerOpen(true)
              }}
              value={modelId ?? ''}
            />
            <ImageInputButton disabled={isActive} />
          </PromptInputTools>

          <ComposerSubmitControls
            activeRunId={activeRun?.id ?? null}
            draft={draft}
            isActive={isActive}
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
  isActive,
  onSessionMaterialized,
  requireGenerateReady,
  sessionId,
  setDraft,
}: {
  isActive: boolean
  onSessionMaterialized: ((args: { sessionId: string }) => void) | undefined
  requireGenerateReady: (() => void) | undefined
  sessionId: string
  setDraft: (draft: string) => void
}): ComposerSubmitHandler {
  const tetra = useApp()
  const { selectThreadFromMessage, threadLeafMessageId } = useSessionThreadAppendTarget(sessionId)

  return useCallback<ComposerSubmitHandler>(
    (message, event) => {
      const text = message.text.trim()
      const parts: UIMessage['parts'] = [
        ...(text === '' ? [] : [{ text, type: 'text' } satisfies UIMessage['parts'][number]]),
        ...message.files,
      ]

      if (isActive || parts.length === 0) {
        return
      }

      const submitter =
        event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
      const isAdd = submitter instanceof HTMLElement && submitter.dataset.action === 'add'
      const session = tetra.transcripts.getSession(sessionId)
      const libraryStore = tetra.stores.library.typedStore
      const shouldSetTitle = libraryStore.tables.sessions.requireEntity(sessionId).title === ''

      if (isAdd) {
        // Add-only submits append committed content without starting model inference.
        const messageId = session.appendMessage({
          parentMessageId: threadLeafMessageId,
          parts,
          role: 'user',
        })
        selectThreadFromMessage(messageId)
        if (shouldSetTitle) {
          libraryStore.tables.sessions.updateRow(sessionId, {
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
          libraryStore.tables.sessions.updateRow(sessionId, {
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
      isActive,
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
// The newest run row provides reactivity; the live Run object is the authority on
// liveness, so a stale non-terminal row (crash, reload, another client) never locks
// the composer.
const useActiveRun = (sessionId: string) => {
  const tetra = useApp()
  const ids = libraryTinybase.useSliceRowIds('runsBySessionNewestFirst', sessionId)
  const run = libraryTinybase.useEntity('runs', ids[0] ?? '')
  if (run === null || run.status !== 'active') {
    return null
  }
  if (tetra.runs.getBySession(sessionId) === null) {
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
      className="text-foreground"
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
  isActive,
  sessionId,
}: {
  activeRunId: string | null
  draft: string
  isActive: boolean
  sessionId: string
}) {
  const tetra = useApp()
  const attachments = usePromptInputAttachments()
  const isEmpty = draft.trim() === '' && attachments.files.length === 0

  return (
    <div className="flex items-center gap-1">
      <SessionUsageMeter sessionId={sessionId} />

      <PromptInputButton
        aria-label="Add"
        data-action="add"
        disabled={!isActive && isEmpty}
        size="icon-sm"
        title="Add"
        type="submit"
        variant="secondary"
      >
        <ArrowUpFromDot className="size-4" />
      </PromptInputButton>

      <PromptInputSubmit
        disabled={!isActive && isEmpty}
        onStop={() => {
          if (activeRunId !== null) {
            tetra.runs.cancel(activeRunId)
          }
        }}
        status={isActive ? 'streaming' : 'ready'}
      />
    </div>
  )
}
