mod kvaser;

#[cfg(target_os = "windows")]
fn show_error_dialog(message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    
    // Attempt to load user32.dll dynamically. If it fails, fail silently.
    if let Ok(lib) = unsafe { libloading::Library::new("user32.dll") } {
        unsafe {
            if let Ok(msg_box) = lib.get::<unsafe extern "system" fn(*mut std::ffi::c_void, *const u16, *const u16, u32) -> i32>(b"MessageBoxW") {
                let wide_msg: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
                let wide_title: Vec<u16> = OsStr::new("SmartCAN Fatal Error").encode_wide().chain(Some(0)).collect();
                msg_box(std::ptr::null_mut(), wide_msg.as_ptr(), wide_title.as_ptr(), 0x00000010 | 0x00000000); // MB_ICONERROR | MB_OK
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn show_error_dialog(_message: &str) {}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let message = match info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &**s,
                None => "Box<dyn Any>",
            },
        };
        let location = info.location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        
        let log_content = format!(
            "SmartCAN Panic Report\n=====================\n\nPanic occurred in {} at {}:\n{}\n",
            location, message, message
        );
        
        // Try to write next to the executable
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                let log_path = parent.join("smartcan_crash.txt");
                let _ = std::fs::write(&log_path, &log_content);
            }
        }
        
        // Write to system temp folder
        let temp_path = std::env::temp_dir().join("smartcan_crash.txt");
        let _ = std::fs::write(&temp_path, &log_content);

        // Show a pop-up error dialog on Windows
        let user_friendly_msg = format!(
            "SmartCAN crashed on startup.\n\nError: {}\nLocation: {}\n\nA crash report has been saved to:\n- %TEMP%\\smartcan_crash.txt",
            message, location
        );
        show_error_dialog(&user_friendly_msg);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_panic_hook();

    let kvaser_state = kvaser::KvaserState {
        is_running: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        active_handle: std::sync::Arc::new(std::sync::Mutex::new(None)),
    };

    let mut builder = tauri::Builder::default()
        .manage(kvaser_state)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        });

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            kvaser::start_kvaser,
            kvaser::stop_kvaser,
            kvaser::send_kvaser
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
