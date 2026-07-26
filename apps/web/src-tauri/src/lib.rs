#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // Startup plugins must be registered before Tauri creates configured windows so their
  // on_window_ready hooks observe the initial main window.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
