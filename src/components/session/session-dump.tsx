import { BugIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCore } from '@/components/use-core'

export function SessionDump({ sessionId }: { sessionId: string }) {
  const core = useCore()

  return (
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
  )
}
