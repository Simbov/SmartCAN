mod kvaser;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let kvaser_state = kvaser::KvaserState {
        is_running: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        active_handle: std::sync::Arc::new(std::sync::Mutex::new(None)),
    };

    tauri::Builder::default()
        .manage(kvaser_state)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            kvaser::start_kvaser,
            kvaser::stop_kvaser,
            kvaser::send_kvaser
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
