import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { Button } from '@tetra/ui/components/ui/button'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { BotIcon, DownloadIcon, PanelRightIcon } from 'lucide-react'
import { useState } from 'react'

import {
  useActiveSessionId,
  useSession,
  useSessionExport,
  useSessionMessageIds,
} from '@/runtime/hooks'

import { Composer } from './composer'
import { DetailPanel } from './detail-panel'
import { Message2 } from './message2'
import { SessionConfig } from './session-config'

export function SessionView() {
  const activeSessionId = useActiveSessionId()

  if (activeSessionId === undefined || activeSessionId === '') {
    return null
  }

  return <ActiveSession key={activeSessionId} sessionId={activeSessionId} />
}

/** Renders the active session. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)
  const sessionExport = useSessionExport(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const [detailOpen, setDetailOpen] = useState(true)

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-b px-2">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {session.title ?? 'New session'}
          </span>
          <Button
            disabled={sessionExport === null}
            onClick={() => {
              if (sessionExport === null) {
                return
              }

              const title = session.title.trim() || session.id
              const safeTitle = title.replaceAll(/[^a-z0-9_-]+/giu, '-').replaceAll(/^-|-$/gu, '')
              const blob = new Blob([JSON.stringify(sessionExport, null, 2)], {
                type: 'application/json',
              })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `tetra-session-${safeTitle}.json`
              link.click()
              URL.revokeObjectURL(url)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <DownloadIcon />
          </Button>
          <Button
            onClick={() => {
              setDetailOpen((prev) => !prev)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRightIcon />
          </Button>
        </header>

        {/* Messages */}
        <Conversation>
          <ConversationContent className="">
            {messageIds.length === 0 ? (
              <ConversationEmptyState
                description="Send a message to get started."
                icon={<BotIcon className="size-5" />}
                title="No messages yet"
              />
            ) : (
              messageIds.map((messageId) => <Message2 key={messageId} messageId={messageId} />)
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <Composer sessionId={sessionId} />
      </div>

      {/* Config panel */}
      <DetailPanel open={detailOpen}>
        <SessionConfig sessionId={sessionId} />
      </DetailPanel>
    </div>
  )
}
