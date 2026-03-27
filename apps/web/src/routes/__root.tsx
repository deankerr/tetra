import { ThemeProvider } from '@lonik/themer'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { TooltipProvider } from '@/components/ui/tooltip'
import { DebugMenu } from '@/components/util/debug-menu'
import { RootErrorComponent } from '@/components/util/root-error'
import { RootNotFoundComponent } from '@/components/util/root-not-found'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
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
        <DebugMenu />
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
