import { createFileRoute } from '@tanstack/react-router'

import { CoreApp } from '@/components/chat/core-app'
import { Workspace } from '@/components/chat/workspace'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <CoreApp>
      <Workspace />
    </CoreApp>
  )
}
