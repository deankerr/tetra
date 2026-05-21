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
import { useState } from 'react'

import { useCredential } from '@/hooks/use-credential'
import { ModelPicker } from '@/session/settings/model-picker'
import { useActiveRequest } from '@/tetra/hooks/requests'
import { useSessionConfig } from '@/tetra/hooks/sessions'
import { useTetra } from '@/tetra/provider'

export function Composer({ sessionId }: { sessionId: string }) {
  const tetra = useTetra()
  const activeRequest = useActiveRequest(sessionId)
  const isStreaming = activeRequest !== null
  const config = useSessionConfig(sessionId)
  const [openrouterApiKey] = useCredential('OPENROUTER_API_KEY')
  const [draft, setDraft] = useState('')

  const handleAdd = () => {
    if (!draft.trim()) {
      return
    }

    tetra.transcripts.appendTextMessage(sessionId, {
      role: 'user',
      text: draft,
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

    const shouldSetTitle = tetra.sessions.get(sessionId).title === ''

    // Clear draft before execute so any TinyBase-triggered re-render sees the empty value
    setDraft('')

    try {
      // Create user and assistant messages, then hand off to the run.
      tetra.transcripts.appendTextMessage(sessionId, { role: 'user', text: message.text })
      const assistantMessageId = tetra.transcripts.appendMessage(sessionId, {
        parts: [],
        role: 'assistant',
      })
      tetra.runs.start({ assistantMessageId })
      if (shouldSetTitle) {
        tetra.sessions.rename(sessionId, message.text.trim().slice(0, 60))
      }
    } catch (error) {
      setDraft(message.text)
      toast.error('Could not start run', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="shrink-0 border-t p-2">
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
                  tetra.runs.cancel(activeRequest.id)
                },
              })}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
