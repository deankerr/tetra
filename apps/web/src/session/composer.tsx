import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@tetra/ui/components/ai-elements/prompt-input'
import type { PromptInputMessage } from '@tetra/ui/components/ai-elements/prompt-input'
import { toast } from '@tetra/ui/components/ui/sonner'
import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useStreamingRequest, useSessionConfig } from '@/api'
import { useCredential } from '@/hooks/use-credential'
import { ModelPicker } from '@/session/settings/model-picker'
import { useTetra } from '@/tetra-provider'

export function Composer({ sessionId }: { sessionId: string }) {
  const tetra = useTetra()
  const activeRequest = useStreamingRequest(sessionId)
  const isStreaming = activeRequest !== null
  const config = useSessionConfig(sessionId)
  const [openrouterApiKey] = useCredential('OPENROUTER_API_KEY')
  const [draft, setDraft] = useState('')

  // Track the assistant message ID for the active stream so we can clean up StreamingState
  const activeAssistantRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeRequest !== null) {
      activeAssistantRef.current = activeRequest.assistantMessageId
    } else if (activeAssistantRef.current !== null) {
      tetra.streamingState.delete(activeAssistantRef.current)
      activeAssistantRef.current = null
    }
  }, [activeRequest, tetra.streamingState])

  const handleAdd = () => {
    if (!draft.trim()) {
      return
    }

    tetra.sessions.addMessage(sessionId, {
      content: draft,
      role: 'user',
    })
    setDraft('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (isStreaming || !message.text.trim()) {
      return
    }

    // Inference happens in-browser, so surface missing credentials before creating rows.
    if (openrouterApiKey.trim() === '') {
      toast.error('OpenRouter API key required', {
        description: 'Add an OpenRouter API key before running model inference.',
      })
      tetra.openCredentialSettings('OPENROUTER_API_KEY')
      return
    }

    // Clear draft before execute so any TinyBase-triggered re-render sees the empty value
    setDraft('')

    // Set title from first message if session is untitled
    if (!tetra.sessions.get(sessionId).title) {
      tetra.sessions.rename(sessionId, message.text.trim().slice(0, 60))
    }

    const { assistantMessageId } = tetra.runner.execute(sessionId, {
      content: message.text,
      onSnapshot: (msg) => {
        tetra.streamingState.update(assistantMessageId, msg)
      },
    })
  }

  return (
    <div className="shrink-0 border-t p-4">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
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
              onValueChange={(modelId) => {
                const current = tetra.sessions.getConfig(sessionId)
                tetra.sessions.setConfig(sessionId, { ...current, modelId })
              }}
              value={config.modelId}
            />
          </PromptInputTools>

          <div className="flex items-center gap-1">
            <PromptInputButton
              aria-label="Add"
              onClick={handleAdd}
              size="icon-sm"
              variant="secondary"
            >
              <PlusIcon className="size-4" />
            </PromptInputButton>

            <PromptInputSubmit
              disabled={!isStreaming && !draft.trim()}
              status={isStreaming ? 'streaming' : 'ready'}
              {...(activeRequest && {
                onStop: () => {
                  tetra.runner.cancel(activeRequest.id)
                },
              })}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
