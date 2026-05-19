import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@tetra/ui/components/ui/sidebar'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { useOpenSessionIds, useSession, useSessionIds, useSetOpenSessionIds } from '@/api'
import { useTetra } from '@/tetra-provider'

export function SessionGroup() {
  const { sessions } = useTetra()
  const sessionIds = useSessionIds()
  const openSessionIds = useOpenSessionIds()
  const setOpenSessionIds = useSetOpenSessionIds()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupAction
        className="top-2.5"
        onClick={() => {
          const newId = sessions.create()
          setOpenSessionIds([...openSessionIds, newId])
        }}
      >
        <PlusIcon />
        <span className="sr-only">New session</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {sessionIds.map((sessionId) => (
            <SessionListItem
              active={openSessionIds.includes(sessionId)}
              key={sessionId}
              onDelete={() => {
                sessions.delete(sessionId)

                // Remove from open list; if that empties it, open the next available session
                const remaining = openSessionIds.filter((id) => id !== sessionId)
                if (remaining.length > 0) {
                  setOpenSessionIds(remaining)
                } else {
                  const nextId = sessionIds.find((id) => id !== sessionId)
                  setOpenSessionIds(nextId === undefined ? [sessions.create()] : [nextId])
                }
              }}
              onRename={(title) => {
                sessions.rename(sessionId, title)
              }}
              onSelect={() => {
                if (openSessionIds.includes(sessionId)) {
                  setOpenSessionIds(openSessionIds.filter((id) => id !== sessionId))
                } else {
                  setOpenSessionIds([...openSessionIds, sessionId])
                }
              }}
              sessionId={sessionId}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  return (
    <SidebarMenuItem>
      {renaming ? (
        <input
          className="ring-ring h-8 w-full rounded-md bg-transparent px-2 text-sm ring-1 outline-none"
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
          {session.title ? (
            <span>{session.title}</span>
          ) : (
            <span className="text-muted-foreground">Untitled</span>
          )}
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
