import { PanelRightIcon } from 'lucide-react'
import { useState } from 'react'

import { AgentCard } from '@/components/agent/agent-card'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useActiveSessionId, useSession } from '@/lib/core/data/sessions'

import { Composer } from './composer'
import { DetailPanel } from './detail-panel'
import { MessageList } from './message-list'

export function SessionView() {
  const activeSessionId = useActiveSessionId()

  if (activeSessionId === undefined || activeSessionId === '') {
    return null
  }

  return <SessionViewInner sessionId={activeSessionId} />
}

function SessionViewInner({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)
  const [detailOpen, setDetailOpen] = useState(true)

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Main content column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="font-medium text-sm">{session.title}</span>
          </div>
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

        <MessageList sessionId={sessionId} />
        <Composer sessionId={sessionId} />
      </div>

      {/* Right detail panel */}
      <DetailPanel open={detailOpen}>
        <AgentCard agentId={session.agentId} />
      </DetailPanel>
    </div>
  )
}
