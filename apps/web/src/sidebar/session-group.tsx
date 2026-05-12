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

import {
  useActiveSessionId,
  useSetActiveSessionId,
  useSession,
  useSessionIds,
} from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

export function SessionGroup() {
  const runtime = useRuntime()
  const sessionIds = useSessionIds()
  const activeSessionId = useActiveSessionId()
  const setActiveSessionId = useSetActiveSessionId()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupAction
        className="top-2.5"
        onClick={() => {
          const sessionId = runtime.commands.createSession()
          setActiveSessionId(sessionId)
        }}
      >
        <PlusIcon />
        <span className="sr-only">New session</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {sessionIds.map((sessionId) => (
            <SessionListItem
              active={sessionId === activeSessionId}
              key={sessionId}
              onDelete={() => {
                runtime.commands.deleteSession({ sessionId })

                // If we deleted the active session, pick another or create one
                if (sessionId === activeSessionId) {
                  const remaining = sessionIds.filter((id) => id !== sessionId)
                  if (remaining.length > 0 && remaining[0] !== undefined) {
                    setActiveSessionId(remaining[0])
                  } else {
                    const newId = runtime.commands.createSession()
                    setActiveSessionId(newId)
                  }
                }
              }}
              onRename={(title) => {
                runtime.commands.updateSession({ sessionId, title })
              }}
              onSelect={() => {
                setActiveSessionId(sessionId)
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
