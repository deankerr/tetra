import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'

import { SessionView } from '@/session/view'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { TetraProvider } from '@/tetra-provider'
import { TinyBaseProvider } from '@/tinybase-provider'

export function App() {
  return (
    <TinyBaseProvider>
      <TetraProvider>
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
        <Toaster richColors />
      </TetraProvider>
    </TinyBaseProvider>
  )
}
