// tauri-agent-tools dev bridge: a localhost-only, token-authed HTTP server that lets the CLI eval JS
// in the webview, inspect the DOM, and tail logs. Self-strips at runtime via cfg!(debug_assertions).
mod dev_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Register the bridge's result callback command (debug only) so injected JS can return values to Rust.
  if cfg!(debug_assertions) {
    builder = builder.invoke_handler(tauri::generate_handler![dev_bridge::__dev_bridge_result]);
  }

  builder
    .setup(|app| {
      // Restore each window's size/position from the last session (saved automatically on exit).
      #[cfg(desktop)]
      app
        .handle()
        .plugin(tauri_plugin_window_state::Builder::default().build())?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        // Bring up the agent-tools dev bridge; a failure here is non-fatal to the app.
        if let Err(e) = dev_bridge::start_bridge(app.handle()) {
          eprintln!("Warning: Failed to start dev bridge: {e}");
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
