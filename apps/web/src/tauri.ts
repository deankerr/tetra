// Detected once at module load: the desktop shell injects __TAURI_INTERNALS__ into the webview, so
// its presence distinguishes the Tauri build from a plain browser tab. Used to gate window-chrome
// affordances (custom title bar drag regions, traffic-light clearance) that only apply on desktop.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
