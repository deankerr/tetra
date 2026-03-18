import { PlusIcon } from 'lucide-react'

import { SessionList } from '@/components/session/session-list'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { useCore } from '@/components/use-core'

export function AppSidebar() {
  const core = useCore()

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <svg className="size-5" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <polygon fill="#0f766e" points="16,2 2,28 16,19" />
            <polygon fill="#14b8a6" points="16,2 16,19 30,28" />
            <polygon fill="#5eead4" points="2,28 30,28 16,19" />
          </svg>
          <span className="font-semibold text-sm">Tetra</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupAction
            className="top-2.5"
            onClick={() => {
              core.createSession()
            }}
          >
            <PlusIcon />
            <span className="sr-only">New session</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              <SessionList />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div>
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
    </>
  )
}
