import { Link } from '@tanstack/react-router'
import { SidebarContent, SidebarFooter, SidebarHeader } from '@tetra/ui/components/ui/sidebar'

import { TetraLogo } from '@/components/tetra-logo'
import { DebugMenu } from '@/components/util/debug-menu'
import { ThemeSwitcher } from '@/components/util/theme-switcher'
import { PersistenceStatus } from '@/sidebar/persistence-status'
import { SessionGroup } from '@/sidebar/session-group'
import { SettingsDialog } from '@/sidebar/settings-dialog'

export function AppSidebar() {
  return (
    <>
      <SidebarHeader className="p-0">
        <Link className="flex h-(--header-height) items-center gap-1.5 border-b px-4" to="/">
          <TetraLogo className="size-4.5" palette="forge" />
          <div className="font-orbitron flex h-4 items-center text-sm leading-none font-semibold tracking-wider uppercase">
            TETRA
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SessionGroup />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-center gap-2">
          <PersistenceStatus />
          <DebugMenu />
          <SettingsDialog />
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
    </>
  )
}
