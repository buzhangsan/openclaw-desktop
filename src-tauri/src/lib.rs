mod commands;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(commands::GatewayProcess(std::sync::Mutex::new(None)))
        .manage(commands::GatewayLogProcess(std::sync::Mutex::new(None)))
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
            commands::setup_embedded_node,
            commands::persist_windows_node_path,
            commands::install_openclaw,
            commands::start_gateway,
            commands::stop_gateway,
            commands::get_gateway_status,
            commands::load_config,
            commands::save_provider_config,
            commands::save_agent_config,
            commands::save_channel_config,
            commands::validate_channel,
            commands::export_diagnostics,
            commands::start_gateway_log_stream,
            commands::stop_gateway_log_stream,
            commands::check_openclaw_update,
            commands::perform_openclaw_update,
            commands::check_gateway_health,
            commands::test_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
