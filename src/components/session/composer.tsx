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
import { ModelPicker } from '@/components/model-picker'
import { useCore } from '@/components/use-core'
import { getDraftConfig, useDraftCell, useUiStore } from '@/lib/ui'

import { useIsStreaming } from './hooks'

export function Composer({ sessionId }: { sessionId: string }) {
  const core = useCore()
  const uiStore = useUiStore()
  const isStreaming = useIsStreaming(sessionId)
  const [draft, setDraft] = useState('')

  // Subscribe to modelId for display — changes in SessionConfig update this reactively
  const [modelId, setModelId] = useDraftCell(sessionId, 'modelId')

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    // Read full draft config imperatively at submit time
    const config = uiStore ? getDraftConfig(uiStore, sessionId) : undefined
    core.sendMessage(sessionId, message.text, config)
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
            className="md:text-sm min-h-14"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelPicker onValueChange={setModelId} value={modelId} />
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
