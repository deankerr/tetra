import { useSidebar } from '@tetra/ui/components/ui/sidebar'

// Detected once at module load: the desktop shell injects __TAURI_INTERNALS__ into the webview, so
// its presence distinguishes the Tauri build from a plain browser tab. Used to gate window-chrome
// affordances (custom title bar drag regions, traffic-light clearance) that only apply on desktop.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// When the sidebar is collapsed on desktop, its empty draggable header strip (which normally holds
// the macOS traffic lights) disappears and the main content header slides to the window's left edge,
// colliding with the traffic-light controls. Reserve left padding on that header to clear them.
export function useTrafficLightClearance(): string {
  const { state } = useSidebar()
  return isTauri && state === 'collapsed' ? 'pl-20' : ''
}
