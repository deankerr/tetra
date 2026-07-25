import { fireEvent, render, screen } from '@testing-library/react'
import { Sidebar, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { beforeEach, expect, test, vi } from 'vitest'

import { WorkspacePane } from '@/components/workspace-pane'

import { SessionPanelErrorBoundary } from './error-boundary'

let shouldThrow = true

function SessionBody() {
  if (shouldThrow) {
    throw new Error('Legacy step is missing performance')
  }

  return <p>Session recovered</p>
}

beforeEach(() => {
  shouldThrow = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

test('a session body failure leaves workspace chrome and sidebar controls operable', () => {
  render(
    <SidebarProvider>
      <Sidebar variant="inset">
        <div>Session navigation</div>
      </Sidebar>
      <WorkspacePane title="PSX graphics">
        <SessionPanelErrorBoundary sessionId="sess_1">
          <SessionBody />
        </SessionPanelErrorBoundary>
      </WorkspacePane>
    </SidebarProvider>,
  )

  expect(screen.getByText('PSX graphics')).not.toBeNull()
  expect(screen.getByText('Session has crashed')).not.toBeNull()
  expect(screen.getByText('Legacy step is missing performance')).not.toBeNull()

  const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
  expect(sidebar?.dataset.state).toBe('expanded')

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

  expect(sidebar?.dataset.state).toBe('collapsed')
})

test('the session fallback resets without becoming a second hook failure', () => {
  render(
    <SidebarProvider>
      <WorkspacePane title="PSX graphics">
        <SessionPanelErrorBoundary sessionId="sess_1">
          <SessionBody />
        </SessionPanelErrorBoundary>
      </WorkspacePane>
    </SidebarProvider>,
  )

  shouldThrow = false
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(screen.getByText('Session recovered')).not.toBeNull()
  expect(screen.getByText('PSX graphics')).not.toBeNull()
})
