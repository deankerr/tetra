import { useState } from 'react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { useCore } from '@/components/chat/use-core'
import { useActiveRequest } from '@/lib/core/data/requests'
import { useSession } from '@/lib/core/data/sessions'

export function Composer({ sessionId }: { sessionId: string }) {
  const core = useCore()
  const session = useSession(sessionId)
  const activeRequest = useActiveRequest(sessionId)
  const [draft, setDraft] = useState('')

  if (session === null) {
    return null
  }

  const isStreaming = activeRequest !== null

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    core.sendMessage(sessionId, message.text)
    setDraft('')
  }

  const handleStop = () => {
    core.cancelRequest(sessionId)
  }

  return (
    <div className="shrink-0 border-t border-border px-6 pb-4 pt-3">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            disabled={isStreaming}
            onChange={(e) => {
              setDraft(e.currentTarget.value)
            }}
            placeholder="Send a message…"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            disabled={!isStreaming && !draft.trim()}
            onStop={handleStop}
            status={isStreaming ? 'streaming' : 'ready'}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
