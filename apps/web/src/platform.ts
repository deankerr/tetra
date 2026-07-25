export type AppPlatform = 'tauri' | 'web'

// Tauri injects this global into its webview before the application boots. Keep platform detection
// independent of React and UI state so window-chrome decisions stay at the application shell seam.
export const appPlatform: AppPlatform =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'web'
