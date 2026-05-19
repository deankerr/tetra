import { Link } from '@tanstack/react-router'
import { SidebarContent, SidebarFooter, SidebarHeader } from '@tetra/ui/components/ui/sidebar'

import { TetraLogo } from '@/components/tetra-logo'
import { ThemeSwitcher } from '@/components/util/theme-switcher'
import { PersistenceStatus } from '@/sidebar/persistence-status'
import { SessionGroup } from '@/sidebar/session-group'
import { SettingsDialog } from '@/sidebar/settings-dialog'

export function AppSidebar() {
  return (
    <>
      <SidebarHeader className="p-0">
        <Link className="flex h-(--header-height) items-center gap-2 border-b px-4" to="/">
          <TetraLogo className="size-5" />
          <span className="font-orbitron text-sm font-semibold uppercase">TETRA</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SessionGroup />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-center gap-2">
          <PersistenceStatus />
          <SettingsDialog />
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
    </>
  )
}
