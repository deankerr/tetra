import { BotIcon, BugIcon, PanelRightIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useCore } from '@/components/use-core'
import { useSessionMessageIds } from '@/lib/core/data/messages'
import { useLatestConfig } from '@/lib/core/data/requests'
import { useActiveSessionId, useSession } from '@/lib/core/data/sessions'
import { initDraft, useUiStore } from '@/lib/ui'

import { Composer } from './composer'
import { DetailPanel } from './detail-panel'
import { TimelineMessage } from './message'
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
  const core = useCore()
  const session = useSession(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const [detailOpen, setDetailOpen] = useState(true)

  // Initialize draft config from last committed config (only if no draft exists yet)
  const uiStore = useUiStore()
  const latestConfig = useLatestConfig(sessionId)
  useEffect(() => {
    if (uiStore) {
      initDraft(uiStore, sessionId, latestConfig)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once per session mount

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-4">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {session.title || 'New session'}
          </span>
          <Button
            onClick={() => {
              const sessionData = core.data.sessions.get(sessionId)
              const messages = core.data.messages.listBySession(sessionId)
              console.log('[session-view:dump]', { messages, session: sessionData })
            }}
            size="icon-sm"
            title="Dump session data to console"
            type="button"
            variant="ghost"
          >
            <BugIcon />
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

        <Composer sessionId={sessionId} />
      </div>

      {/* Config panel */}
      <DetailPanel open={detailOpen}>
        <SessionConfig sessionId={sessionId} />
      </DetailPanel>
    </div>
  )
}
