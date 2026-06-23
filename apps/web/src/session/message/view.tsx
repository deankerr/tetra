import type { LibraryRows } from '@tetra/stores/web'
import {
  Message as AiMessage,
  MessageContent as AiMessageContent,
} from '@tetra/ui/components/ai-elements/message'
import { cn } from '@tetra/ui/lib/utils'
import type { UIMessage } from 'ai'

import { libraryTinybase } from '@/lib/tinybase'

import { MessageActionsView } from './actions'
import { getRunErrorMessage, useMessageRun, useMessageRunActive } from './data'
import { MessageHeader } from './header'
import { MessageParts } from './parts'

type MessageRow = LibraryRows['messages']
type RunRow = LibraryRows['runs']

export function MessageView({
  className,
  isThreadLeafMessage,
  messageId,
  ...props
}: {
  isThreadLeafMessage: boolean
  messageId: string
} & React.ComponentProps<'div'>) {
  const message = libraryTinybase.useEntity('messages', messageId)
  const run = useMessageRun(messageId)

  if (message === null) {
    throw new Error(`MessageView expected message ${messageId} to exist`)
  }

  const isActive = useMessageRunActive(run)

  return (
    <AiMessage
      className={cn('text-xxs gap-2 py-1', className)}
      from={getAiMessageRole(message.role)}
      {...props}
    >
      <MessageHeader isActive={isActive} message={message} run={run} />
      <AiMessageContent className="group-[.is-assistant]:w-full">
        <MessageParts isStreaming={isActive} messageId={message.id} parts={message.parts} />
        <MessageRunError run={run} />
      </AiMessageContent>

      {!isActive && (
        <MessageActionsView isThreadLeafMessage={isThreadLeafMessage} message={message} run={run} />
      )}
    </AiMessage>
  )
}

function MessageRunError({ run }: { run: RunRow | null }) {
  const errorMessage = getRunErrorMessage(run)

  if (errorMessage === null) {
    return null
  }

  return (
    <div
      className="border-destructive/30 text-destructive text-xxs rounded-md border p-2 font-mono"
      role="alert"
    >
      {errorMessage}
    </div>
  )
}

function getAiMessageRole(role: MessageRow['role']): UIMessage['role'] {
  if (role === 'user') {
    return 'user'
  }

  return 'assistant'
}
