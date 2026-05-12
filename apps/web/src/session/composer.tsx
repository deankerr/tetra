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

    runtime.commands.sendMessage({
      sessionId,
      text: message.text,
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
            placeholder="Send a message…"
            value={draft}
            className="min-h-14 md:text-sm"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ModelPicker
              onValueChange={(modelId) => {
                runtime.commands.updateSessionConfig({ patch: { modelId }, sessionId })
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
