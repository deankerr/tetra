import { Link } from '@tanstack/react-router'
import { SidebarContent, SidebarFooter, SidebarHeader } from '@tetra/ui/components/ui/sidebar'

import { TetraLogo } from '@/components/tetra-logo'
import { SettingsButton } from '@/settings-dialog'
import { ThemeSwitcher } from '@/sidebar/footer/theme-switcher'
import { SessionGroup } from '@/sidebar/session-group'
import { SyncStatusButton } from '@/sync-settings'

export function AppSidebar() {
  return (
    <>
      <SidebarHeader className="p-0">
        <Link
          className="flex h-(--header-height) items-center gap-1.5 border-b px-4 md:-mx-2 md:px-6"
          to="/"
        >
          <TetraLogo className="size-4.5" />
          <div className="font-orbitron flex translate-y-px items-center text-sm leading-none font-semibold tracking-wider uppercase">
            TETRA
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SessionGroup />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-center gap-1">
          <SettingsButton />
          <SyncStatusButton />
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
    </>
  )
}
