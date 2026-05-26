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
import { useMemo, useRef, useState } from 'react'

import { useTetra } from '@/tetra-context'
import { typedTinybase } from '@/tetra-tinybase-react'
import { WEB_UI_STORE_ID, webUiTinybase } from '@/web-ui-state'

// Sessions sorted by updatedAt descending — most recently active first.
// appendMessage touches updatedAt, so this order naturally tracks conversation activity.
const useSessionIds = () => {
  const sessions = typedTinybase.useEntityList('sessions')
  return useMemo(
    () =>
      sessions
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
        .map((session) => session.id),
    [sessions],
  )
}

export function SessionGroup() {
  const { helpers } = useTetra()
  const sessionIds = useSessionIds()
  const [activeSessionId, setActiveSessionId] = webUiTinybase.useValueState(
    'activeSessionId',
    WEB_UI_STORE_ID,
  )

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupAction
        className="top-2.5"
        onClick={() => {
          const newId = helpers.createSession()
          setActiveSessionId(newId)
        }}
      >
        <PlusIcon />
        <span className="sr-only">New session</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {sessionIds.map((sessionId) => (
            <SessionListItem
              active={activeSessionId === sessionId}
              key={sessionId}
              onDelete={() => {
                helpers.deleteSession(sessionId)

                // If the active session was deleted, move to the next available session.
                if (activeSessionId === sessionId) {
                  const nextId = sessionIds.find((id) => id !== sessionId)
                  setActiveSessionId(nextId ?? helpers.createSession())
                }
              }}
              onRename={(title) => {
                helpers.typedStore.tables.sessions.updateRow(sessionId, {
                  title,
                  updatedAt: Date.now(),
                })
              }}
              onSelect={() => {
                if (activeSessionId === sessionId) {
                  setActiveSessionId('')
                } else {
                  setActiveSessionId(sessionId)
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
  const session = typedTinybase.useEntity('sessions', sessionId)
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
