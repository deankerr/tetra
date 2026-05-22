/** Wipe all persisted data (OPFS + localStorage) and reload. */
export async function clearAllData() {
  // OPFS — where the runtime store is persisted
  const root = await navigator.storage.getDirectory()
  for (const fileName of ['tetra-runtime.json', 'tetra-redesign-runtime.json']) {
    try {
      await root.removeEntry(fileName)
    } catch {
      // File may not exist.
    }
  }
  location.reload()
}
