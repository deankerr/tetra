/** Wipe all persisted data (OPFS + localStorage) and reload. */
export async function clearAllData() {
  // OPFS — where the runtime store is persisted
  const root = await navigator.storage.getDirectory()
  try {
    await root.removeEntry('tetra-runtime.json')
  } catch {
    // File may not exist
  }
  location.reload()
}
