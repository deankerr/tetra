import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { useCommandRecord, useRecentCommandIds, useSessionRecord } from '@/lib/chat/react'

import { CommandStatusBadge, StatusBadge } from './status-badges'

export function RuntimePanel({ sessionId }: { sessionId: string }) {
  const commandIds = useRecentCommandIds(6)
  const session = useSessionRecord(sessionId)

  if (session === null) {
    return null
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Runtime State</CardTitle>
        <CardDescription>
          Recent commands stay visible so failure and recovery paths are inspectable.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={session.status} />
          {session.activeCommandId ? (
            <Badge variant="secondary">active {session.activeCommandId}</Badge>
          ) : null}
          {session.errorMessage ? (
            <Badge variant="destructive">{session.errorMessage}</Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {commandIds.map((commandId) => (
            <RuntimeCommand key={commandId} commandId={commandId} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RuntimeCommand({ commandId }: { commandId: string }) {
  const command = useCommandRecord(commandId)

  if (command === null) {
    return null
  }

  const subtitle =
    command.errorMessage === ''
      ? `${command.sessionId} at ${new Date(command.createdAt).toLocaleTimeString()}`
      : command.errorMessage

  return (
    <Item size="xs" variant="muted">
      <ItemContent>
        <div className="flex items-center justify-between gap-2">
          <ItemTitle>{command.type}</ItemTitle>
          <CommandStatusBadge status={command.status} />
        </div>
        <ItemDescription>{subtitle}</ItemDescription>
      </ItemContent>
    </Item>
  )
}
