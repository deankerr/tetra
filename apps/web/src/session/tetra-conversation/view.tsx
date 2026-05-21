import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { cn } from '@tetra/ui/lib/utils'

import { TetraLogo } from '@/components/tetra-logo'
import { useSessionMessageIds } from '@/tetra/hooks/transcripts'

import { Composer } from '../composer'
import { TetraMessageView } from './message-view'

export function TetraConversationView({
  sessionId,
  className,
  ...props
}: { sessionId: string } & React.ComponentProps<'div'>) {
  const messageIds = useSessionMessageIds(sessionId)

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} {...props}>
      <Conversation>
        <ConversationContent>
          {messageIds.length === 0 ? (
            <ConversationEmptyState
              description="Send a message to get started."
              icon={<TetraLogo className="size-5" />}
              title="No messages yet"
            />
          ) : (
            messageIds.map((messageId) => (
              <TetraMessageView key={messageId} messageId={messageId} />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <Composer sessionId={sessionId} />
    </div>
  )
}
