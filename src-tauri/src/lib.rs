mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_system_status,
            commands::install_openclaw,
            commands::start_gateway,
            commands::stop_gateway,
            commands::get_gateway_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
