import { BotIcon, CopyIcon, Loader2Icon, RefreshCcwIcon } from 'lucide-react'
import { Fragment } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { useMessageRecord, useSessionMessageIds } from '@/lib/chat/react'
import type { StoredMessage } from '@/lib/chat/repository'

export function MessageList({ sessionId }: { sessionId: string }) {
  const messageIds = useSessionMessageIds(sessionId)

  return (
    <Conversation>
      <ConversationContent>
        {messageIds.length === 0 ? (
          <ConversationEmptyState
            description="Start a conversation and watch the runtime write through TinyBase."
            icon={<BotIcon className="size-5" />}
            title="No messages yet"
          />
        ) : (
          messageIds.map((messageId, index) => (
            <TimelineMessage
              isLast={index === messageIds.length - 1}
              key={messageId}
              messageId={messageId}
            />
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

// Render each part of the message following AI Elements patterns
function MessageParts({ message }: { message: StoredMessage }) {
  const { parts } = message
  const hasTextParts = parts.some((p) => p.type === 'text')

  // Streaming placeholder — assistant has no parts yet
  if (message.role === 'assistant' && !hasTextParts) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span>Streaming response…</span>
      </div>
    )
  }

  return parts.map((part, i) => {
    const key = `${message.id}-${String(i)}`

    // oxlint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- TODO: render reasoning, tool, file, source parts
    switch (part.type) {
      case 'text': {
        if (message.role === 'user') {
          return (
            <div className="whitespace-pre-wrap" key={key}>
              {part.text}
            </div>
          )
        }
        return <MessageResponse key={key}>{part.text}</MessageResponse>
      }

      default: {
        return null
      }
    }
  })
}

function getFullText(message: StoredMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function TimelineMessage({ isLast, messageId }: { messageId: string; isLast: boolean }) {
  const record = useMessageRecord(messageId)

  if (record === null) {
    return null
  }

  const { message } = record
  const isAssistant = message.role === 'assistant'

  return (
    <Fragment>
      <Message from={message.role}>
        <MessageContent>
          <MessageParts message={message} />
        </MessageContent>
      </Message>

      {isAssistant && isLast && (
        <MessageActions>
          {/* TODO: wire up regenerate when command pattern changes */}
          <MessageAction label="Regenerate">
            <RefreshCcwIcon className="size-3" />
          </MessageAction>
          <MessageAction
            label="Copy"
            onClick={() => void navigator.clipboard.writeText(getFullText(message))}
          >
            <CopyIcon className="size-3" />
          </MessageAction>
        </MessageActions>
      )}
    </Fragment>
  )
}
