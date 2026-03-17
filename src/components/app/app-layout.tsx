import type { ReactNode } from 'react'

import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './app-sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <AppSidebar />
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
