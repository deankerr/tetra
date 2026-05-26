import { ThemeProvider } from '@lonik/themer'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { TooltipProvider } from '@tetra/ui/components/ui/tooltip'
import { RootErrorComponent } from '@/components/root-error'
import { RootNotFoundComponent } from '@/components/root-not-found'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { TetraProvider } from '@/tetra-provider'
import { TinyBaseProvider } from '@/tinybase-provider'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  component: RootAppLayout,
  errorComponent: RootErrorComponent,
  head: () => ({
    links: [
      {
        href: appCss,
        rel: 'stylesheet',
      },
      {
        href: '/favicon.svg',
        rel: 'icon',
        type: 'image/svg+xml',
      },
    ],
    meta: [
      {
        charSet: 'utf8',
      },
      {
        content: 'width=device-width, initial-scale=1',
        name: 'viewport',
      },
      {
        title: 'Tetra',
      },
    ],
  }),
  notFoundComponent: RootNotFoundComponent,
  shellComponent: RootDocument,
})

function RootAppLayout() {
  return (
    <TinyBaseProvider>
      <TetraProvider>
        <SidebarProvider>
          <Sidebar>
            <AppSidebar />
          </Sidebar>

          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <div className="flex h-full overflow-x-auto">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors />
      </TetraProvider>
    </TinyBaseProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="dark" enableSystem storageKey="tetra-theme">
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
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
        <Scripts />
      </body>
    </html>
  )
}
