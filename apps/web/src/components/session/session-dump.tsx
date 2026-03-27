import { BugIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useRuntime } from '@/components/use-runtime'

export function SessionDump({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()

  return (
    <Button
      onClick={() => {
        const sessionData = runtime.sessions.get(sessionId)
        const messages = runtime.messages.listBySession(sessionId)
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
