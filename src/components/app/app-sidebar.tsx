import { PlusIcon } from 'lucide-react'

import { useCore } from '@/components/core/use-core'
import { SessionList } from '@/components/session/session-list'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { DEFAULT_AGENT_ID } from '@/lib/core/data/agents'

import { ThemeSwitcher } from './theme-switcher'

export function AppSidebar() {
  const core = useCore()

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-sm">Tetra</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupAction
            onClick={() => {
              core.createSession(DEFAULT_AGENT_ID)
            }}
            title="New session"
          >
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarMenu>
            <SessionList />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <ThemeSwitcher />
      </SidebarFooter>
    </>
  )
}
