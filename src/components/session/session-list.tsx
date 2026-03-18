import { MoreHorizontalIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useCore } from '@/components/use-core'
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
          onDelete={() => {
            core.deleteSession(sessionId)
          }}
          onRename={(title) => {
            core.updateSession(sessionId, title)
          }}
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
  onDelete,
  onRename,
  onSelect,
  sessionId,
}: {
  active: boolean
  onDelete: () => void
  onRename: (title: string) => void
  onSelect: () => void
  sessionId: string
}) {
  const session = useSession(sessionId)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (session === null) {
    return null
  }

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed !== '' && trimmed !== session.title) {
      onRename(trimmed)
    }
    setRenaming(false)
  }

  const startRename = () => {
    setDraft(session.title)
    setRenaming(true)
    // Focus after React renders the input
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  return (
    <SidebarMenuItem>
      {renaming ? (
        <input
          className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none ring-1 ring-ring"
          onBlur={commitRename}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitRename()
            }
            if (e.key === 'Escape') {
              setRenaming(false)
            }
          }}
          ref={inputRef}
          value={draft}
        />
      ) : (
        <SidebarMenuButton isActive={active} onClick={onSelect}>
          <span>{session.title}</span>
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={startRename}>Rename</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
