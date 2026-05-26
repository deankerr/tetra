import { createFileRoute } from '@tanstack/react-router'

import { SessionView } from '@/session/view'

export const Route = createFileRoute('/')({
  component: SessionView,
})
