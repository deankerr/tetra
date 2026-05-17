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
import { PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useStreamingRequest, useSessionConfig } from '@/api'
import { ModelPicker } from '@/models/model-picker'
import { useTetra } from '@/tetra-provider'

export function Composer({ sessionId }: { sessionId: string }) {
  const { runner, sessions, streamingState } = useTetra()
  const activeRequest = useStreamingRequest(sessionId)
  const isStreaming = activeRequest !== null
  const config = useSessionConfig(sessionId)
  const [draft, setDraft] = useState('')

  // Track the assistant message ID for the active stream so we can clean up StreamingState
  const activeAssistantRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeRequest !== null) {
      activeAssistantRef.current = activeRequest.assistantMessageId
    } else if (activeAssistantRef.current !== null) {
      streamingState.delete(activeAssistantRef.current)
      activeAssistantRef.current = null
    }
  }, [activeRequest, streamingState])

  const handleAdd = () => {
    if (!draft.trim()) {
      return
    }

    sessions.addMessage(sessionId, {
      content: draft,
      role: 'user',
    })
    setDraft('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (isStreaming || !message.text.trim()) {
      return
    }

    // Clear draft before execute so any TinyBase-triggered re-render sees the empty value
    setDraft('')

    // Set title from first message if session is untitled
    if (!sessions.get(sessionId).title) {
      sessions.rename(sessionId, message.text.trim().slice(0, 60))
    }

    const { assistantMessageId } = runner.execute(sessionId, {
      content: message.text,
      onSnapshot: (msg) => {
        streamingState.update(assistantMessageId, msg)
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
                const current = sessions.getConfig(sessionId)
                sessions.setConfig(sessionId, { ...current, modelId })
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
                  runner.cancel(activeRequest.id)
                },
              })}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
