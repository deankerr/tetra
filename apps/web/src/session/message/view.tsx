import type { Rows } from '@tetra/store-schema'
import { Message as AiMessage } from '@tetra/ui/components/ai-elements/message'
import { cn } from '@tetra/ui/lib/utils'
import type { UIMessage } from 'ai'

import { typedTinybase } from '@/lib/tinybase'

import { MessageActionsView } from './actions'
import { MessageContentView } from './content'
import { isMessageRunStreaming, useMessageRun } from './data'
import { MessageHeader } from './header'

type MessageRow = Rows['messages']

export function MessageView({
  className,
  isThreadLeafMessage,
  messageId,
  ...props
}: {
  isThreadLeafMessage: boolean
  messageId: string
} & React.ComponentProps<'div'>) {
  const message = typedTinybase.useEntity('messages', messageId)
  const run = useMessageRun(messageId)

  if (message === null) {
    throw new Error(`MessageView expected message ${messageId} to exist`)
  }

  const isStreaming = isMessageRunStreaming(run)

  return (
    <AiMessage
      className={cn('text-xxs gap-2 py-1', className)}
      from={getAiMessageRole(message.role)}
      {...props}
    >
      <MessageHeader message={message} run={run} />
      <MessageContentView message={message} run={run} />

      {!isStreaming && (
        <MessageActionsView isThreadLeafMessage={isThreadLeafMessage} message={message} run={run} />
      )}
    </AiMessage>
  )
}

function getAiMessageRole(role: MessageRow['role']): UIMessage['role'] {
  if (role === 'user') {
    return 'user'
  }

  return 'assistant'
}
