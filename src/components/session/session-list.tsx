import { MoreHorizontalIcon } from 'lucide-react'

import { useCore } from '@/components/core/use-core'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useActiveSessionId, useSession, useSessionIds } from '@/lib/core/data/sessions'

export function SessionList() {
  const core = useCore()
  const sessionIds = useSessionIds()
  const activeSessionId = useActiveSessionId()

  return (
    <>
      {sessionIds.map((sessionId) => (
        <SessionListItem
          active={sessionId === activeSessionId}
          key={sessionId}
          onSelect={() => {
            core.selectSession(sessionId)
          }}
          sessionId={sessionId}
        />
      ))}
    </>
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

  if (session === null) {
    return null
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} onClick={onSelect}>
        <span>{session.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                console.log('[session-list:rename]', 'stub', { sessionId })
              }}
            >
              Rename
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                console.log('[session-list:delete]', 'stub', { sessionId })
              }}
              variant="destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
