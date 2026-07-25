import { fireEvent, render, screen } from '@testing-library/react'
import { SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { expect, test, vi } from 'vitest'

import { WorkspacePane } from './workspace-pane'

vi.mock('@/platform', () => ({ appPlatform: 'tauri' }))

test('collapsed Tauri chrome reserves the macOS window-controls area', () => {
  render(
    <SidebarProvider defaultOpen={false}>
      <WorkspacePane title="Session title">
        <p>Session content</p>
      </WorkspacePane>
    </SidebarProvider>,
  )

  const header = screen.getByRole('banner')
  expect(header.className).toContain('ps-20')
  expect(Object.hasOwn(header.dataset, 'tauriDragRegion')).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

  expect(header.className).not.toContain('ps-20')
})
