import { createFileRoute } from '@tanstack/react-router'

import { NewSessionPage } from '@/session/new-session-page'

export const Route = createFileRoute('/')({
  component: NewSessionPage,
})
