/** Wipe all persisted data (IndexedDB + localStorage) and reload. */
export function clearAllData() {
  indexedDB.deleteDatabase('tetra')
  localStorage.removeItem('tetra-ui')
  localStorage.removeItem('tetra-theme')
  location.reload()
}
