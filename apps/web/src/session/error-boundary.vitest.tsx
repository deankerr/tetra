import { fireEvent, render, screen } from '@testing-library/react'
import { Sidebar, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { beforeEach, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { WorkspacePane } from '@/components/workspace-pane'

import { SessionPanelErrorBoundary } from './error-boundary'

let errorKind: 'render' | 'schema'

function SessionBody() {
  if (errorKind === 'schema') {
    z.object({ performance: z.object({}) }).parse({})
    return <p>Session loaded</p>
  }

  throw new Error('Legacy step is missing performance')
}

beforeEach(() => {
  errorKind = 'render'
  vi.spyOn(console, 'error').mockImplementation((...messages: unknown[]) => {
    void messages
  })
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
  expect(screen.getByText('Error')).not.toBeNull()
  expect(screen.getByText('Legacy step is missing performance')).not.toBeNull()
  expect(screen.getByText('Stack trace')).not.toBeNull()

  const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
  expect(sidebar?.dataset.state).toBe('expanded')

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

  expect(sidebar?.dataset.state).toBe('collapsed')
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

test('a schema failure uses the same developer details as any other error', () => {
  errorKind = 'schema'

  render(
    <SidebarProvider>
      <WorkspacePane title="PSX graphics">
        <SessionPanelErrorBoundary sessionId="sess_1">
          <SessionBody />
        </SessionPanelErrorBoundary>
      </WorkspacePane>
    </SidebarProvider>,
  )

  expect(screen.getByText('Session has crashed')).not.toBeNull()
  expect(screen.getByText('ZodError')).not.toBeNull()
  expect(screen.queryByText(/prototype schema change/u)).toBeNull()
  expect(screen.getAllByText(/"path": \[/u).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/"performance"/u).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/"code": "invalid_type"/u).length).toBeGreaterThan(0)
  expect(screen.getByText('Stack trace')).not.toBeNull()
  expect(screen.getByText('PSX graphics')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Go home' })).not.toBeNull()
})
