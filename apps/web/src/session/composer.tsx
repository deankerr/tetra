import { DEFAULT_REQUEST_CONFIG } from '@tetra/core'
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
import { useState } from 'react'

import { ModelPicker } from '@/session/settings/model-picker'
import { useSettings } from '@/settings-provider'
import { useTetra } from '@/tetra-context'
import { typedTinybase } from '@/tinybase'
import { useCredential } from '@/use-credential'

import { useRequest, useSessionRequestIds } from './hooks'

const activeStatuses = new Set(['preparing', 'streaming'])

export function Composer({ sessionId }: { sessionId: string }) {
  const tetra = useTetra()
  const settings = useSettings()
  const activeRequest = useActiveRequest(sessionId)
  const isStreaming = activeRequest !== null
  const [modelId, setModelId] = typedTinybase.useCellState('sessionConfigs', sessionId, 'modelId')
  const [openrouterApiKey] = useCredential('OPENROUTER_API_KEY')
  const [draft, setDraft] = useState('')

  const handleSubmit: NonNullable<Parameters<typeof PromptInput>[0]['onSubmit']> = (
    message,
    event,
  ) => {
    const text = message.text.trim()

    const parts: UIMessage['parts'] = [
      ...(text === '' ? [] : [{ text, type: 'text' } satisfies UIMessage['parts'][number]]),
      ...message.files,
    ]

    if (isStreaming || parts.length === 0) {
      return
    }

    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null
    const isAdd = submitter instanceof HTMLElement && submitter.dataset.action === 'add'

    if (isAdd) {
      tetra.store.appendMessage(sessionId, { parts, role: 'user' })
      setDraft('')
      return
    }

    // Inference happens in-browser, so surface missing credentials before creating rows.
    if (openrouterApiKey.trim() === '') {
      toast.error('OpenRouter API key required', {
        description: 'Add an OpenRouter API key before running model inference.',
      })
      settings.openCredentialSettings('OPENROUTER_API_KEY')
      throw new Error('OpenRouter API key required')
    }

    const shouldSetTitle = tetra.store.getSession(sessionId).title === ''

    // Clear draft before execute so any TinyBase-triggered re-render sees the empty value
    setDraft('')

    try {
      // Create user and assistant messages, then hand off to the run.
      tetra.store.appendMessage(sessionId, { parts, role: 'user' })
      const assistantMessageId = tetra.store.appendMessage(sessionId, {
        parts: [],
        role: 'assistant',
      })
      tetra.runs.start({ assistantMessageId })
      if (shouldSetTitle) {
        tetra.store.renameSession(sessionId, text === '' ? 'Image' : text.slice(0, 60))
      }
    } catch (error) {
      setDraft(text)
      toast.error('Could not start run', {
        description: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  return (
    <div className="shrink-0 border-t p-2">
      <PromptInput accept="image/*" multiple onSubmit={handleSubmit}>
        <PromptInputBody>
          <ComposerAttachments />
          <PromptInputTextarea
            disabled={isStreaming}
            onChange={(e) => {
              setDraft(e.currentTarget.value)
            }}
            placeholder="Where would you like to go today?"
            value={draft}
            className="min-h-14 md:text-sm"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelPicker
              onValueChange={(nextModelId) => {
                setModelId(nextModelId)
              }}
              value={modelId ?? DEFAULT_REQUEST_CONFIG.modelId}
            />
            <ImageInputButton disabled={isStreaming} />
          </PromptInputTools>

          <ComposerSubmitControls
            activeRequestId={activeRequest?.id ?? null}
            draft={draft}
            isStreaming={isStreaming}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

// Returns the current active request for this composer so submit controls stay in sync.
const useActiveRequest = (sessionId: string) => {
  const ids = useSessionRequestIds(sessionId)
  const request = useRequest(ids[0] ?? '')
  if (request === null || !activeStatuses.has(request.status)) {
    return null
  }
  return request
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
      type="button"
    >
      <ImageIcon className="size-4" />
    </PromptInputButton>
  )
}

function ComposerSubmitControls({
  activeRequestId,
  draft,
  isStreaming,
}: {
  activeRequestId: string | null
  draft: string
  isStreaming: boolean
}) {
  const tetra = useTetra()
  const attachments = usePromptInputAttachments()
  const isEmpty = draft.trim() === '' && attachments.files.length === 0

  return (
    <div className="flex items-center gap-1">
      <PromptInputButton
        aria-label="Add"
        data-action="add"
        disabled={!isStreaming && isEmpty}
        size="icon-sm"
        type="submit"
        variant="secondary"
      >
        <ArrowUpFromDot className="size-4" />
      </PromptInputButton>

      <PromptInputSubmit
        disabled={!isStreaming && isEmpty}
        onStop={() => {
          if (activeRequestId !== null) {
            tetra.runs.cancel(activeRequestId)
          }
        }}
        status={isStreaming ? 'streaming' : 'ready'}
      />
    </div>
  )
}
