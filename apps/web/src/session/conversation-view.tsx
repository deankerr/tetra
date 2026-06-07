import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { cn } from '@tetra/ui/lib/utils'

import { TetraLogo } from '@/components/tetra-logo'
import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

import { Composer } from './composer'
import { TetraMessageView } from './message-view'

export function TetraConversationView({
  sessionId,
  className,
  ...props
}: { sessionId: string } & React.ComponentProps<'div'>) {
  const { transcripts } = useTetra()
  const sessionMessageIds = typedTinybase.useSliceRowIds('messagesBySession', sessionId)
  const messageIds =
    sessionMessageIds.length === 0
      ? []
      : transcripts
          .getSession(sessionId)
          .getThread()
          .messages()
          .map((message) => message.id)

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} {...props}>
      <Conversation>
        <ConversationContent className="p-2">
          {messageIds.length === 0 ? (
            <ConversationEmptyState
              description="Send a message to get started."
              icon={<TetraLogo className="size-5" />}
              title="No messages yet"
            />
          ) : (
            messageIds.map((messageId, i) => (
              <TetraMessageView
                key={messageId}
                isLastMessage={i === messageIds.length - 1}
                messageId={messageId}
              />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <Composer sessionId={sessionId} />
    </div>
  )
}
