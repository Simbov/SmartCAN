use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use libloading::Library;

// Global state to manage the active listener thread and device handle
pub struct KvaserState {
    pub is_running: Arc<AtomicBool>,
    pub active_handle: Arc<Mutex<Option<i32>>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct TauriCanFrame {
    pub timestamp: u64,
    pub id: u32,
    pub dlc: usize,
    pub data: Vec<u8>,
}

// Struct holding dynamically loaded CANlib function pointers
struct Canlib {
    _lib: Library,
    _can_initialize_library: unsafe extern "C" fn(),
    can_get_number_of_channels: unsafe extern "C" fn(*mut i32) -> i32,
    can_open_channel: unsafe extern "C" fn(i32, i32) -> i32,
    can_close: unsafe extern "C" fn(i32) -> i32,
    can_set_bus_params: unsafe extern "C" fn(i32, i32, i32, i32, i32, i32, i32) -> i32,
    can_bus_on: unsafe extern "C" fn(i32) -> i32,
    can_bus_off: unsafe extern "C" fn(i32) -> i32,
    can_read: unsafe extern "C" fn(i32, *mut i32, *mut u8, *mut u32, *mut u32, *mut u64) -> i32,
    can_write: unsafe extern "C" fn(i32, i32, *const u8, u32, u32) -> i32,
}

impl Canlib {
    fn load() -> Option<Self> {
        let mut paths = Vec::new();
        
        if cfg!(target_os = "windows") {
            paths.push("canlib32.dll");
        } else if cfg!(target_os = "macos") {
            paths.push("libcanlib.dylib");
            paths.push("/usr/local/lib/libcanlib.dylib");
            paths.push("/opt/homebrew/lib/libcanlib.dylib");
        } else {
            paths.push("libcanlib.so");
            paths.push("/usr/lib/libcanlib.so");
            paths.push("/usr/local/lib/libcanlib.so");
        }

        let mut loaded_lib = None;
        for path in paths {
            if let Ok(lib) = unsafe { Library::new(path) } {
                loaded_lib = Some(lib);
                break;
            }
        }

        let lib = loaded_lib?;
        
        unsafe {
            let can_initialize_library: unsafe extern "C" fn() = *lib.get::<unsafe extern "C" fn()>(b"canInitializeLibrary").ok()?;
            let can_get_number_of_channels: unsafe extern "C" fn(*mut i32) -> i32 = *lib.get::<unsafe extern "C" fn(*mut i32) -> i32>(b"canGetNumberOfChannels").ok()?;
            let can_open_channel: unsafe extern "C" fn(i32, i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32, i32) -> i32>(b"canOpenChannel").ok()?;
            let can_close: unsafe extern "C" fn(i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canClose").ok()?;
            let can_set_bus_params: unsafe extern "C" fn(i32, i32, i32, i32, i32, i32, i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32, i32, i32, i32, i32, i32, i32) -> i32>(b"canSetBusParams").ok()?;
            let can_bus_on: unsafe extern "C" fn(i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canBusOn").ok()?;
            let can_bus_off: unsafe extern "C" fn(i32) -> i32 = *lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canBusOff").ok()?;
            let can_read: unsafe extern "C" fn(i32, *mut i32, *mut u8, *mut u32, *mut u32, *mut u64) -> i32 = *lib.get::<unsafe extern "C" fn(i32, *mut i32, *mut u8, *mut u32, *mut u32, *mut u64) -> i32>(b"canRead").ok()?;
            let can_write: unsafe extern "C" fn(i32, i32, *const u8, u32, u32) -> i32 = *lib.get::<unsafe extern "C" fn(i32, i32, *const u8, u32, u32) -> i32>(b"canWrite").ok()?;

            // Call library initialization
            can_initialize_library();

            Some(Self {
                _lib: lib,
                _can_initialize_library: can_initialize_library,
                can_get_number_of_channels,
                can_open_channel,
                can_close,
                can_set_bus_params,
                can_bus_on,
                can_bus_off,
                can_read,
                can_write,
            })
        }
    }
}

// Thread-safe OnceLock for CANlib to avoid reloading repeatedly
static CANLIB: OnceLock<Option<Canlib>> = OnceLock::new();

fn get_canlib() -> Option<&'static Canlib> {
    CANLIB.get_or_init(Canlib::load).as_ref()
}

/// Spawns a background thread to poll the Kvaser Leaf interface.
/// If physical hardware or drivers are missing, it falls back to a simulated telemetry bus,
/// ensuring the Tauri integration works immediately.
#[tauri::command]
pub fn start_kvaser(app: AppHandle, baud_rate: u32, state: State<'_, KvaserState>) -> Result<String, String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Ok("Kvaser listener is already running".to_string());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let is_running = state.is_running.clone();
    let active_handle = state.active_handle.clone();

    // Check if we can load CANlib and open channel 0
    let mut channel_opened = None;
    if let Some(canlib) = get_canlib() {
        unsafe {
            let mut num_channels = 0;
            let status = (canlib.can_get_number_of_channels)(&mut num_channels);
            if status >= 0 && num_channels > 0 {
                // Open first channel (0)
                let handle = (canlib.can_open_channel)(0, 0x0020 /* canOPEN_ACCEPT_VIRTUAL */);
                if handle >= 0 {
                    // Set bus parameters based on selected baud rate
                    let freq_preset = match baud_rate {
                        125000 => -9,
                        250000 => -3,
                        500000 => -2,
                        1000000 => -1,
                        _ => -3, // default to 250k
                    };
                    
                    let param_status = (canlib.can_set_bus_params)(handle, freq_preset, 0, 0, 0, 0, 0);
                    if param_status >= 0 {
                        let bus_status = (canlib.can_bus_on)(handle);
                        if bus_status >= 0 {
                            channel_opened = Some(handle);
                        } else {
                            (canlib.can_close)(handle);
                        }
                    } else {
                        (canlib.can_close)(handle);
                    }
                }
            }
        }
    }

    let has_real_kvaser = channel_opened.is_some();
    let handle_val = channel_opened.unwrap_or(-1);
    
    // Store active handle
    {
        let mut h = active_handle.lock().unwrap();
        *h = channel_opened;
    }

    // Spawning listener thread
    thread::spawn(move || {
        if has_real_kvaser {
            if let Some(canlib) = get_canlib() {
                while is_running.load(Ordering::SeqCst) {
                    let mut id = 0;
                    let mut data = vec![0u8; 8];
                    let mut dlc = 0;
                    let mut flag = 0;
                    let mut timestamp = 0;
                    
                    let read_status = unsafe {
                        (canlib.can_read)(
                            handle_val,
                            &mut id,
                            data.as_mut_ptr(),
                            &mut dlc,
                            &mut flag,
                            &mut timestamp,
                        )
                    };
                    
                    if read_status == 0 {
                        data.truncate(dlc as usize);
                        let frame = TauriCanFrame {
                            timestamp,
                            id: id as u32,
                            dlc: dlc as usize,
                            data,
                        };
                        let _ = app.emit("kvaser-frame", frame);
                    } else if read_status == -2 {
                        // canERR_NOMSG: Sleep briefly to avoid busy wait
                        thread::sleep(Duration::from_millis(2));
                    } else {
                        // Other error, sleep briefly
                        thread::sleep(Duration::from_millis(5));
                    }
                }
                
                // Clean up channel:
                unsafe {
                    let _ = (canlib.can_bus_off)(handle_val);
                    let _ = (canlib.can_close)(handle_val);
                }
            }
        } else {
            // Idle virtual bus loop - stays silent until messages are sent
            while is_running.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(100));
            }
        }

        // Reset state handle
        {
            let mut h = active_handle.lock().unwrap();
            *h = None;
        }
    });

    if has_real_kvaser {
        Ok(format!("Started physical Kvaser Leaf Light on channel 0 at {} bps", baud_rate))
    } else {
        Ok(format!("Started simulated Kvaser Leaf Light at {} bps (Kvaser library not found or device missing)", baud_rate))
    }
}

#[tauri::command]
pub fn stop_kvaser(state: State<'_, KvaserState>) -> Result<String, String> {
    state.is_running.store(false, Ordering::SeqCst);
    Ok("Stopped Kvaser leaf".to_string())
}

#[tauri::command]
pub fn send_kvaser(id: u32, data: Vec<u8>, state: State<'_, KvaserState>) -> Result<String, String> {
    if !state.is_running.load(Ordering::SeqCst) {
        return Err("Cannot transmit: Kvaser is not connected".to_string());
    }

    let handle_opt = {
        let h = state.active_handle.lock().unwrap();
        *h
    };

    if let Some(handle) = handle_opt {
        if let Some(canlib) = get_canlib() {
            let status = unsafe {
                (canlib.can_write)(
                    handle,
                    id as i32,
                    data.as_ptr(),
                    data.len() as u32,
                    0, // default flags
                )
            };
            if status >= 0 {
                return Ok(format!("Transmitted physical frame 0x{:X}", id));
            } else {
                return Err(format!("CANlib write failed with code {}", status));
            }
        }
    }

    Ok(format!("Simulated transmission of frame 0x{:X}", id))
}
