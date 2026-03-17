import { createFileRoute } from '@tanstack/react-router'

import { AppLayout } from '@/components/app/app-layout'
import { CoreApp } from '@/components/core/core-app'
import { SessionView } from '@/components/session/session-view'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <CoreApp>
      <AppLayout>
        <SessionView />
      </AppLayout>
    </CoreApp>
  )
}
