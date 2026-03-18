import type { RefObject } from 'react'
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
import { useCore } from '@/components/use-core'
import type { InferenceConfig } from '@/lib/core/data/config'

import { useIsStreaming } from './hooks'

export function Composer({
  configRef,
  sessionId,
}: {
  configRef: RefObject<InferenceConfig>
  sessionId: string
}) {
  const core = useCore()
  const isStreaming = useIsStreaming(sessionId)
  const [draft, setDraft] = useState('')

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    core.sendMessage(sessionId, message.text, configRef.current)
    setDraft('')
  }

  const handleStop = () => {
    core.cancelRequest(sessionId)
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
