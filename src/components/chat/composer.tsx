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
import { getDataLayer } from '@/lib/core/data'
import { useActiveRequest, useLatestRequest } from '@/lib/core/data/requests'
import { useSession } from '@/lib/core/data/sessions'
import { cancelRequest, sendMessage } from '@/lib/core/operations'

import { StatusBadge } from './status-badges'

export function Composer({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)
  const activeRequest = useActiveRequest(sessionId)
  const latestRequest = useLatestRequest(sessionId)
  const [draft, setDraft] = useState('')

  if (session === null) {
    return null
  }

  const isStreaming = activeRequest !== null
  const showError = latestRequest !== null && latestRequest.status === 'error'

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    sendMessage(getDataLayer(), sessionId, message.text)
    setDraft('')
  }

  const handleStop = () => {
    cancelRequest(getDataLayer(), sessionId)
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
          <PromptInputTools>
            <StatusBadge status={activeRequest?.status ?? latestRequest?.status ?? null} />
            {showError && latestRequest.errorMessage !== '' && (
              <span className="truncate text-xs text-destructive">
                {latestRequest.errorMessage}
              </span>
            )}
          </PromptInputTools>
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
