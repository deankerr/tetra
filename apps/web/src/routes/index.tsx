import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { WorkspacePane } from '@/components/workspace-pane'
import { WorkspacePaneError } from '@/components/workspace-pane-error'
import { NewSessionPage } from '@/session/new-session-page'

export const Route = createFileRoute('/')({
  component: NewSessionPage,
  errorComponent: NewSessionRouteError,
})

function NewSessionRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <WorkspacePane title="New session unavailable">
      <WorkspacePaneError
        error={error}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
        title="New session unavailable"
      />
    </WorkspacePane>
  )
}
