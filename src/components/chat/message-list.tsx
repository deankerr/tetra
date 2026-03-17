import type { UIMessage } from 'ai'
import { AlertCircleIcon, BotIcon, CopyIcon, Loader2Icon, RefreshCcwIcon } from 'lucide-react'
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
import { useCore } from '@/components/chat/use-core'
import { useMessage, useSessionMessageIds } from '@/lib/core/data/messages'
import type { Request } from '@/lib/core/data/requests'
import { useRequestForMessage } from '@/lib/core/data/requests'

export function MessageList({ sessionId }: { sessionId: string }) {
  const core = useCore()
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
              onRegenerate={() => core.regenerate(sessionId)}
            />
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

// Render each part of the message based on request state
function MessageParts({ message, request }: { message: UIMessage; request: Request | null }) {
  const { parts } = message
  const hasTextParts = parts.some((p) => p.type === 'text')

  // Empty assistant message — render based on request status
  if (message.role === 'assistant' && !hasTextParts) {
    const status = request?.status

    // Actively streaming, just no content yet
    if (status === 'pending' || status === 'streaming') {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          <span>Streaming response…</span>
        </div>
      )
    }

    // All other states (error, completed, cancelled, no request) — render nothing.
    // Error display is handled by TimelineMessage as a standalone block.
    return null
  }

  return (
    <>
      {parts.map((part, i) => {
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
      })}

      {/* Partial content + error: show error indicator after content */}
      {request?.status === 'error' && request.errorMessage !== '' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircleIcon className="size-3" />
          <span>{request.errorMessage}</span>
        </div>
      )}
    </>
  )
}

function getFullText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function TimelineMessage({
  isLast,
  messageId,
  onRegenerate,
}: {
  messageId: string
  isLast: boolean
  onRegenerate: () => void
}) {
  const record = useMessage(messageId)
  const request = useRequestForMessage(messageId)

  if (record === null) {
    return null
  }

  const { message } = record
  const isAssistant = message.role === 'assistant'
  const hasTextParts = message.parts.some((p) => p.type === 'text')

  // Empty assistant message with error — standalone error block with retry
  if (isAssistant && !hasTextParts && request?.status === 'error') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{request.errorMessage || 'Unknown error'}</span>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={onRegenerate}
          type="button"
        >
          <RefreshCcwIcon className="size-3.5" />
        </button>
      </div>
    )
  }

  // Empty assistant message cancelled — minimal block with retry
  if (isAssistant && !hasTextParts && request?.status === 'cancelled') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span>Cancelled</span>
        <button className="hover:text-foreground" onClick={onRegenerate} type="button">
          <RefreshCcwIcon className="size-3.5" />
        </button>
      </div>
    )
  }

  // Empty assistant message with no active stream and no terminal state — render nothing
  if (
    isAssistant &&
    !hasTextParts &&
    request?.status !== 'pending' &&
    request?.status !== 'streaming'
  ) {
    return null
  }

  return (
    <Fragment>
      <Message from={message.role}>
        <MessageContent>
          <MessageParts message={message} request={request} />
        </MessageContent>
      </Message>

      {/* Copy on all assistant messages with content, regenerate on last only */}
      {isAssistant && hasTextParts && (
        <MessageActions>
          {isLast && (
            <MessageAction label="Regenerate" onClick={onRegenerate}>
              <RefreshCcwIcon className="size-3" />
            </MessageAction>
          )}
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
