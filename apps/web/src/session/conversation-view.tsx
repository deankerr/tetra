import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { cn } from '@tetra/ui/lib/utils'

import { TetraLogo } from '@/components/tetra-logo'

import { Composer } from './composer'
import { MessageView } from './message/view'
import { useSessionThreadView } from './thread-view'

export function ConversationView({
  sessionId,
  className,
  ...props
}: { sessionId: string } & React.ComponentProps<'div'>) {
  const { messageIds } = useSessionThreadView(sessionId)

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
              <MessageView
                className="mx-auto w-full max-w-3xl"
                key={messageId}
                isThreadLeafMessage={i === messageIds.length - 1}
                messageId={messageId}
              />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 px-2 pb-2">
        <Composer className="mx-auto max-w-3xl" sessionId={sessionId} />
      </div>
    </div>
  )
}
