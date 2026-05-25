import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'

import { SessionView } from '@/session/view'
import { SettingsProvider } from '@/settings-provider'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { TetraProvider } from '@/tetra-data-provider'

export function App() {
  return (
    <TetraProvider>
      <SettingsProvider>
        <SidebarProvider>
          <Sidebar>
            <AppSidebar />
          </Sidebar>

          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <div className="flex h-full overflow-x-auto">
              <SessionView />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </SettingsProvider>
    </TetraProvider>
  )
}
