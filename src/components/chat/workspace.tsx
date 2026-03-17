import { PlusIcon } from 'lucide-react'

import { useCore } from '@/components/chat/use-core'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { DEFAULT_AGENT_ID } from '@/lib/core/data/agents'
import { useActiveSessionId } from '@/lib/core/data/sessions'

import { ThemeSwitcher } from '../theme-switcher'
import { AgentPanel } from './agent-panel'
import { Composer } from './composer'
import { MessageList } from './message-list'
import { SessionList } from './session-list'

export function Workspace() {
  const core = useCore()
  const activeSessionId = useActiveSessionId()

  if (activeSessionId === '') {
    return null
  }

  return (
    <div className="grid h-svh grid-cols-[300px_1fr] overflow-hidden bg-background">
      <aside className="flex min-h-0 flex-col border-r bg-muted/40">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="font-medium text-sm">Tetra</div>
            <div className="text-muted-foreground text-xs">Initial slice prototype</div>
          </div>
          <ThemeSwitcher />
          <Button
            onClick={() => {
              core.createSession(DEFAULT_AGENT_ID)
            }}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-3 pb-3">
            <SessionList />
            <Separator />
            <AgentPanel sessionId={activeSessionId} />
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden min-w-sm">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="font-medium text-sm">Evaluate the proposed TinyBase structure</div>
          <div className="text-muted-foreground text-xs truncate">
            UI writes commands to the runtime store. The runtime owns streaming and recovery.
          </div>
        </div>

        <MessageList sessionId={activeSessionId} />
        <Composer sessionId={activeSessionId} />
      </main>
    </div>
  )
}
