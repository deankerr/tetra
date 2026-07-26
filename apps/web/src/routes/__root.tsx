import { ThemeProvider } from '@lonik/themer'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { TooltipProvider } from '@tetra/ui/components/ui/tooltip'
import { AppProvider } from '@/app'
import { ErrorFallback } from '@/components/error-fallback'
import { JsonViewSheet } from '@/components/json-view-sheet'
import { appPlatform } from '@/platform'
import { SettingsDialog } from '@/settings-dialog'
import { AppSidebar } from '@/sidebar/app-sidebar'

import '../styles.css'

export const Route = createRootRoute({
  component: RootAppLayout,
  errorComponent: RootRouteError,
  notFoundComponent: RootNotFound,
})

function RootRouteError({ error }: ErrorComponentProps) {
  return (
    <ErrorFallback
      className="bg-background min-h-svh"
      error={error}
      title="Something went wrong"
    />
  )
}

function RootNotFound() {
  return (
    <ErrorFallback
      className="bg-background min-h-svh"
      description="The page you're looking for doesn't exist."
      showHomeAction
      title="Page not found"
    />
  )
}

function RootAppLayout() {
  return (
    <ThemeProvider defaultTheme="dark" enableSystem storageKey="tetra-theme">
      <TooltipProvider>
        <AppProvider>
          <SidebarProvider data-platform={appPlatform}>
            <Sidebar variant='inset'>
              <AppSidebar />
            </Sidebar>

            <SidebarInset className="bg-canvas h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
              <div className="flex h-full min-w-0">
                <Outlet />
              </div>
            </SidebarInset>
          </SidebarProvider>
          <SettingsDialog />
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
