import { PlusIcon } from 'lucide-react'
import { useState } from 'react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { getDraftConfig, useDraftCell, useUiStore } from '@/local-store/ui'
import { ModelPicker } from '@/models/model-picker'
import { useRuntime } from '@/runtime/use-runtime'

import { useIsStreaming } from './hooks'

export function Composer({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const uiStore = useUiStore()
  const isStreaming = useIsStreaming(sessionId)
  const [draft, setDraft] = useState('')

  // Subscribe to modelId for display — changes in SessionConfig update this reactively
  const [modelId, setModelId] = useDraftCell(sessionId, 'modelId')

  const handleAdd = () => {
    if (!draft.trim()) {
      return
    }
    runtime.commands.addMessage({
      sessionId,
      text: draft,
    })
    setDraft('')
  }

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) {
      return
    }

    // Read full draft config imperatively at submit time
    const config = getDraftConfig(uiStore, sessionId)
    runtime.commands.sendMessage({
      config,
      sessionId,
      targetExecutorId: runtime.executorId,
      text: message.text,
    })
    setDraft('')
  }

  const handleStop = () => {
    runtime.commands.cancelRequest({ sessionId })
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
              onStop={handleStop}
              status={isStreaming ? 'streaming' : 'ready'}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
