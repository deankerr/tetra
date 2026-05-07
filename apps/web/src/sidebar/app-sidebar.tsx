import { SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { ThemeSwitcher } from '@/components/util/theme-switcher'
import { SessionGroup } from '@/sidebar/session-group'
import { SettingsDialog } from '@/sidebar/settings-dialog'

export function AppSidebar() {
  return (
    <>
      <SidebarHeader className="p-0">
        <div className="flex items-center gap-2 px-4 border-b h-(--header-height)">
          <svg className="size-5" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <polygon fill="#0f766e" points="16,2 2,28 16,19" />
            <polygon fill="#14b8a6" points="16,2 16,19 30,28" />
            <polygon fill="#5eead4" points="2,28 30,28 16,19" />
          </svg>
          <span className="font-semibold text-sm">Tetra</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SessionGroup />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex justify-center items-center gap-2">
          <SettingsDialog />
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
    </>
  )
}
