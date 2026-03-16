import type { ChatStatus } from 'ai'
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
import { cancelActiveCommand, sendMessage } from '@/lib/chat/commands'
import { useSessionRecord } from '@/lib/chat/react'

import { StatusBadge } from './status-badges'

// Map TinyBase session status to AI SDK ChatStatus
function toChatStatus(sessionStatus: string): ChatStatus {
  if (sessionStatus === 'streaming') {
    return 'streaming'
  }
  if (sessionStatus === 'error') {
    return 'error'
  }
  return 'ready'
}

export function Composer({ sessionId }: { sessionId: string }) {
  const session = useSessionRecord(sessionId)
  const [draft, setDraft] = useState('')

  if (session === null) {
    return null
  }

  const chatStatus = toChatStatus(session.status)
  const isActive = chatStatus === 'streaming' || chatStatus === 'submitted'

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    const commandId = sendMessage(sessionId, message.text)
    if (commandId !== null) {
      setDraft('')
    }
  }

  const handleStop = () => {
    cancelActiveCommand(sessionId)
  }

  return (
    <div className="shrink-0 border-t border-border px-6 pb-4 pt-3">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            disabled={isActive}
            onChange={(e) => {
              setDraft(e.currentTarget.value)
            }}
            placeholder="Send a message…"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <StatusBadge status={session.status} />
          </PromptInputTools>
          <PromptInputSubmit
            disabled={!isActive && !draft.trim()}
            onStop={handleStop}
            status={chatStatus}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
