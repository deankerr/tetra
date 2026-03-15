import { createFileRoute } from '@tanstack/react-router'

import { Demo } from '@/components/demo'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="flex min-h-svh">
      <Demo />
    </div>
  )
}
