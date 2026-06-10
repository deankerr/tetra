import { createFileRoute } from '@tanstack/react-router'

import { SessionView } from '@/session/view'

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionRoute,
})

function SessionRoute() {
  const { sessionId } = Route.useParams()

  return <SessionView sessionId={sessionId} />
}
