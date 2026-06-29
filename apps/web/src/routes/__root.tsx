import { ThemeProvider } from '@lonik/themer'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { TooltipProvider } from '@tetra/ui/components/ui/tooltip'
import { ApiKeySettingsDialog } from '@/api-key-settings'
import { AppProvider } from '@/app'
import { JsonViewSheet } from '@/components/json-view-sheet'
import { RootErrorComponent } from '@/components/root-error'
import { RootNotFoundComponent } from '@/components/root-not-found'
import { AppSidebar } from '@/sidebar/app-sidebar'

import '../styles.css'

export const Route = createRootRoute({
  component: RootAppLayout,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
})

function RootAppLayout() {
  return (
    <ThemeProvider defaultTheme="dark" enableSystem storageKey="tetra-theme">
      <TooltipProvider>
        <AppProvider>
          <SidebarProvider>
            <Sidebar variant='inset'>
              <AppSidebar />
            </Sidebar>

            <SidebarInset className="bg-canvas h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
              <div className="flex h-full min-w-0">
                <Outlet />
              </div>
            </SidebarInset>
          </SidebarProvider>
          <ApiKeySettingsDialog />
          <JsonViewSheet />
          <Toaster richColors />
        </AppProvider>
        <TanStackDevtools
          config={{
            openHotkey: ['Control', 'A'],
            position: 'bottom-right',
            triggerHidden: true,
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}
