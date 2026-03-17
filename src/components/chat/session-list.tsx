import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { getDataLayer } from '@/lib/core/data'
import { useMessage, useSessionMessageIds } from '@/lib/core/data/messages'
import { useLatestRequest } from '@/lib/core/data/requests'
import { useActiveSessionId, useSession, useSessionIds } from '@/lib/core/data/sessions'
import { getMessageText, selectSession } from '@/lib/core/operations'

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
            selectSession(getDataLayer(), sessionId)
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
  const session = useSession(sessionId)
  const latestRequest = useLatestRequest(sessionId)
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
            <StatusBadge status={latestRequest?.status ?? null} />
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
  const record = useMessage(messageId)

  if (record === null) {
    return 'No text content yet'
  }

  return getMessageText(record.message) || 'No text content yet'
}
