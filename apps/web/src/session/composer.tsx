import type { RunConfig } from '@tetra/schemas/library'
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
import type { AppContextValue } from '@/app'
import { ModelPickerButton, ModelPickerSheet } from '@/session/settings/model-picker'
import { libraryReact } from '@/store'

import { useRunConfig } from './run-config-providers'
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
  requireGenerateReady?: (() => void) | undefined
  sessionId: string
}) {
  const activeRun = useActiveRun(sessionId)
  const isActive = activeRun !== null
  const [draft, setDraft] = useState('')
  const { selectThreadFromMessage, threadLeafMessageId } = useSessionThreadAppendTarget(sessionId)
  const handleSubmit = useComposerSubmit({
    isActive,
    onSessionMaterialized,
    requireGenerateReady,
    selectThreadFromMessage,
    sessionId,
    setDraft,
    threadLeafMessageId,
  })

  return (
    <ComposerForm
      activeRunId={activeRun?.id ?? null}
      className={className}
      draft={draft}
      isActive={isActive}
      onDraftChange={setDraft}
      onSubmit={handleSubmit}
      sessionId={sessionId}
    />
  )
}

export function NewSessionComposer({
  className,
  onSessionMaterialized,
  requireGenerateReady,
}: {
  className?: string
  onSessionMaterialized?: (args: { sessionId: string }) => void
  requireGenerateReady?: (() => void) | undefined
}) {
  const [draft, setDraft] = useState('')
  const handleSubmit = useComposerSubmit({
    isActive: false,
    onSessionMaterialized,
    requireGenerateReady,
    selectThreadFromMessage: undefined,
    sessionId: null,
    setDraft,
    threadLeafMessageId: null,
  })

  return (
    <ComposerForm
      activeRunId={null}
      className={className}
      draft={draft}
      isActive={false}
      onDraftChange={setDraft}
      onSubmit={handleSubmit}
      sessionId={null}
    />
  )
}

function ComposerForm({
  activeRunId,
  className,
  draft,
  isActive,
  onDraftChange,
  onSubmit,
  sessionId,
}: {
  activeRunId: string | null
  className: string | undefined
  draft: string
  isActive: boolean
  onDraftChange: (draft: string) => void
  onSubmit: ComposerSubmitHandler
  sessionId: string | null
}) {
  const { config, updateConfig } = useRunConfig()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  return (
    <>
      <PromptInput accept="image/*" className={className} multiple onSubmit={onSubmit}>
        <PromptInputBody>
          <ComposerAttachments />
          <PromptInputTextarea
            className="min-h-14 md:text-sm"
            disabled={isActive}
            onChange={(e) => {
              onDraftChange(e.currentTarget.value)
            }}
            placeholder="Where do you want to go today?"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelPickerButton
              className="text-foreground"
              onClick={() => {
                setModelPickerOpen(true)
              }}
              value={config.modelId}
            />
            <ImageInputButton disabled={isActive} />
          </PromptInputTools>

          <ComposerSubmitControls
            activeRunId={activeRunId}
            draft={draft}
            isActive={isActive}
            sessionId={sessionId}
          />
        </PromptInputFooter>
      </PromptInput>
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          updateConfig({ modelId: nextModelId })
        }}
        open={modelPickerOpen}
        value={config.modelId}
      />
    </>
  )
}

function useComposerSubmit({
  isActive,
  onSessionMaterialized,
  requireGenerateReady,
  selectThreadFromMessage,
  sessionId,
  setDraft,
  threadLeafMessageId,
}: {
  isActive: boolean
  onSessionMaterialized: ((args: { sessionId: string }) => void) | undefined
  requireGenerateReady: (() => void) | undefined
  selectThreadFromMessage: ((messageId: string) => void) | undefined
  sessionId: string | null
  setDraft: (draft: string) => void
  threadLeafMessageId: string | null
}): ComposerSubmitHandler {
  const tetra = useApp()
  const { config } = useRunConfig()

  return useCallback<ComposerSubmitHandler>(
    (message, event) => {
      const submission = getComposerSubmission(message, event)
      if (isActive || submission === null) {
        return
      }

      if (!submission.isAdd) {
        // Send can be preflighted by the surrounding view before any transcript rows exist.
        requireGenerateReady?.()
      }

      try {
        const target = getComposerSubmitTarget({
          config,
          sessionId,
          tetra,
          threadLeafMessageId,
        })
        const userMessageId = target.session.appendMessage({
          parentMessageId: target.parentMessageId,
          parts: submission.parts,
          role: 'user',
        })
        let submittedMessageId = userMessageId

        if (!submission.isAdd) {
          // Send extends the committed user message with an empty assistant target for streaming.
          submittedMessageId = target.session.appendMessage({
            parentMessageId: userMessageId,
            parts: [],
            role: 'assistant',
          })
          tetra.runs.generate({ targetMessageId: submittedMessageId })
        }

        selectThreadFromMessage?.(submittedMessageId)
        setDraft('')
        onSessionMaterialized?.({ sessionId: target.sessionId })
      } catch (error) {
        if (!submission.isAdd) {
          toast.error('Could not generate response', {
            description: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }
    },
    [
      config,
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

function getComposerSubmitTarget({
  config,
  sessionId,
  tetra,
  threadLeafMessageId,
}: {
  config: RunConfig
  sessionId: string | null
  tetra: AppContextValue
  threadLeafMessageId: string | null
}) {
  if (sessionId === null) {
    const nextSessionId = tetra.transcripts.createSession({ config })

    // Drafts become durable only on submit; their first message starts at the root.
    return {
      parentMessageId: null,
      session: tetra.transcripts.getSession(nextSessionId),
      sessionId: nextSessionId,
    }
  }

  const session = tetra.transcripts.getSession(sessionId)

  // Existing sessions append to the selected thread; transcripts own session title inference.
  return {
    parentMessageId: threadLeafMessageId,
    session,
    sessionId,
  }
}

function getComposerSubmission(
  message: Parameters<ComposerSubmitHandler>[0],
  event: Parameters<ComposerSubmitHandler>[1],
) {
  const text = message.text.trim()
  const parts: UIMessage['parts'] = [
    ...(text === '' ? [] : [{ text, type: 'text' } satisfies UIMessage['parts'][number]]),
    ...message.files,
  ]

  if (parts.length === 0) {
    return null
  }

  const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
  const isAdd = submitter instanceof HTMLElement && submitter.dataset.action === 'add'

  return { isAdd, parts }
}

// Returns the current active run for this composer so submit controls stay in sync.
// The newest run row provides reactivity; the live Run object is the authority on
// liveness, so a stale non-terminal row (crash, reload, another client) never locks
// the composer.
const useActiveRun = (sessionId: string) => {
  const tetra = useApp()
  const run = libraryReact.runs.useBySessionNewestFirst(sessionId)[0] ?? null
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
  sessionId: string | null
}) {
  const tetra = useApp()
  const attachments = usePromptInputAttachments()
  const isEmpty = draft.trim() === '' && attachments.files.length === 0

  return (
    <div className="flex items-center gap-1">
      {sessionId === null ? null : <SessionUsageMeter sessionId={sessionId} />}

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
