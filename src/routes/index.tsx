import { createFileRoute } from '@tanstack/react-router'

import { PrototypeApp } from '@/components/chat/prototype-app'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return <PrototypeApp />
}
