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
import { useState } from 'react'

import { ModelPicker } from '@/models/model-picker'
import { useActiveRequest, useSessionConfig } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

export function Composer({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const isStreaming = useActiveRequest(sessionId) !== null
  const config = useSessionConfig(sessionId)
  const [draft, setDraft] = useState('')

  const handleAdd = () => {
    if (!draft.trim()) {
      return
    }

    const session = runtime.sessions.get(sessionId)
    session.messages.add({
      parts: [{ text: draft, type: 'text' }],
      role: 'user',
    })
    setDraft('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (isStreaming || !message.text.trim()) {
      return
    }

    const session = runtime.sessions.get(sessionId)
    const userMessage = session.messages.add({
      parts: [{ text: message.text, type: 'text' }],
      role: 'user',
    })
    const assistantMessage = session.messages.add({
      parts: [],
      role: 'assistant',
    })
    session.execute({
      assistantMessageId: assistantMessage.messageId,
      messageId: userMessage.messageId,
    })
    setDraft('')
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
                runtime.sessions.get(sessionId).updateConfig({ patch: { modelId } })
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
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
