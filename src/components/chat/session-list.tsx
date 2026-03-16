import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { getMessageText } from '@/lib/chat/app'
import { selectSession } from '@/lib/chat/commands'
import {
  useActiveSessionId,
  useMessageRecord,
  useSessionIds,
  useSessionMessageIds,
  useSessionRecord,
} from '@/lib/chat/react'

import { StatusBadge } from './status-badges'

export function SessionList() {
  const sessionIds = useSessionIds()
  const activeSessionId = useActiveSessionId()

  return (
    <ItemGroup className="gap-2">
      {sessionIds.map((sessionId) => (
        <SessionListItem
          active={sessionId === activeSessionId}
          key={sessionId}
          onSelect={() => {
            selectSession(sessionId)
          }}
          sessionId={sessionId}
        />
      ))}
    </ItemGroup>
  )
}

function SessionListItem({
  active,
  onSelect,
  sessionId,
}: {
  active: boolean
  onSelect: () => void
  sessionId: string
}) {
  const session = useSessionRecord(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const latestMessageId = messageIds.at(-1) ?? ''

  if (session === null) {
    return null
  }

  return (
    <button className="w-full text-left" onClick={onSelect} type="button">
      <Item
        className={
          active ? 'border-primary/30 bg-primary/5' : 'hover:border-border hover:bg-muted/40'
        }
        variant="outline"
      >
        <ItemContent>
          <div className="flex items-center justify-between gap-2">
            <ItemTitle>{session.title}</ItemTitle>
            <StatusBadge status={session.status} />
          </div>
          <ItemDescription>
            {latestMessageId === '' ? (
              'No messages yet'
            ) : (
              <SessionPreview messageId={latestMessageId} />
            )}
          </ItemDescription>
        </ItemContent>
      </Item>
    </button>
  )
}

function SessionPreview({ messageId }: { messageId: string }) {
  const message = useMessageRecord(messageId)

  if (message === null) {
    return 'No text content yet'
  }

  return getMessageText(message.message) || 'No text content yet'
}
