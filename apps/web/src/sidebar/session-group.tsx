import { Link, useMatch, useNavigate } from '@tanstack/react-router'
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

import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

// Sessions sorted by updatedAt descending — most recently active first.
// Transcript writes touch updatedAt, so this order naturally tracks conversation activity.
const useSessionIds = (draftSessionId: string) => {
  const sessions = typedTinybase.useEntityList('sessions')
  return useMemo(
    () =>
      sessions
        .filter((session) => session.id !== draftSessionId)
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
        .map((session) => session.id),
    [draftSessionId, sessions],
  )
}

export function SessionGroup() {
  const { helpers, transcripts } = useTetra()
  const activeSessionMatch = useMatch({
    from: '/sessions/$sessionId',
    shouldThrow: false,
  })
  const draftSessionId = typedTinybase.useEntity('draftSessions', 'current')?.sessionId ?? ''
  const navigate = useNavigate()
  const sessionIds = useSessionIds(draftSessionId)
  const activeSessionId = activeSessionMatch?.params.sessionId ?? ''

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupAction className="top-2.5" render={<Link to="/" />} title="New session">
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
                transcripts.deleteSession(sessionId)

                // Deleting the visible session returns to the unsaved composer.
                if (activeSessionId === sessionId) {
                  void navigate({ to: '/' })
                }
              }}
              onRename={(title) => {
                helpers.typedStore.tables.sessions.updateRow(sessionId, {
                  title,
                  updatedAt: Date.now(),
                })
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
  sessionId,
}: {
  active: boolean
  onDelete: () => void
  onRename: (title: string) => void
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
        <SidebarMenuButton
          aria-current={active ? 'page' : undefined}
          isActive={active}
          render={<Link params={{ sessionId }} to="/sessions/$sessionId" />}
        >
          {session.title ? (
            <span>{session.title}</span>
          ) : (
            <span className="text-muted-foreground">Untitled</span>
          )}
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              aria-label={`Session actions for ${session.title || 'Untitled session'}`}
              showOnHover
            />
          }
        >
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
