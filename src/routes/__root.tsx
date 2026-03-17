import { ThemeProvider } from '@lonik/themer'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { HeadContent, Scripts, createRootRoute, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { AlertCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'

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

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8">
      <AlertCircleIcon className="size-8 text-destructive" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-medium text-lg">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
      </div>
      <Button
        onClick={() => {
          reset()
          void router.invalidate()
        }}
        variant="outline"
      >
        Try again
      </Button>
    </div>
  )
}

function RootNotFoundComponent() {
  const router = useRouter()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-medium text-lg">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      </div>
      <Button
        onClick={() => {
          void router.navigate({ to: '/' })
        }}
        variant="outline"
      >
        Go home
      </Button>
    </div>
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
