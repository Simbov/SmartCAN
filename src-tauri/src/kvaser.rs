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
    can_enum_hardware_ex: Option<unsafe extern "C" fn(*mut i32) -> i32>,
    can_open_channel: unsafe extern "C" fn(i32, i32) -> i32,
    can_close: unsafe extern "C" fn(i32) -> i32,
    can_set_bus_params: unsafe extern "C" fn(i32, i32, i32, i32, i32, i32, i32) -> i32,
    can_bus_on: unsafe extern "C" fn(i32) -> i32,
    can_bus_off: unsafe extern "C" fn(i32) -> i32,
    can_read: unsafe extern "C" fn(i32, *mut i32, *mut u8, *mut u32, *mut u32, *mut u64) -> i32,
    can_write: unsafe extern "C" fn(i32, i32, *const u8, u32, u32) -> i32,
    can_get_channel_data: unsafe extern "C" fn(i32, i32, *mut std::ffi::c_void, usize) -> i32,
}

impl Canlib {
    fn load() -> Result<Self, String> {
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
        let mut last_err = None;
        for path in &paths {
            match unsafe { Library::new(*path) } {
                Ok(lib) => {
                    loaded_lib = Some(lib);
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
                }
            }
        }

        let lib = match loaded_lib {
            Some(l) => l,
            None => {
                let err_msg = match last_err {
                    Some(e) => format!("Could not load Kvaser CANlib library. Looked in: {:?}. OS Error: {:?}", paths, e),
                    None => format!("Could not load Kvaser CANlib library. Looked in: {:?}", paths),
                };
                return Err(err_msg);
            }
        };
        
        unsafe {
            let can_initialize_library = lib.get::<unsafe extern "C" fn()>(b"canInitializeLibrary")
                .map_err(|e| format!("Failed to find symbol 'canInitializeLibrary': {:?}", e))?;
            let can_get_number_of_channels = lib.get::<unsafe extern "C" fn(*mut i32) -> i32>(b"canGetNumberOfChannels")
                .map_err(|e| format!("Failed to find symbol 'canGetNumberOfChannels': {:?}", e))?;
            let can_open_channel = lib.get::<unsafe extern "C" fn(i32, i32) -> i32>(b"canOpenChannel")
                .map_err(|e| format!("Failed to find symbol 'canOpenChannel': {:?}", e))?;
            let can_close = lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canClose")
                .map_err(|e| format!("Failed to find symbol 'canClose': {:?}", e))?;
            let can_set_bus_params = lib.get::<unsafe extern "C" fn(i32, i32, i32, i32, i32, i32, i32) -> i32>(b"canSetBusParams")
                .map_err(|e| format!("Failed to find symbol 'canSetBusParams': {:?}", e))?;
            let can_bus_on = lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canBusOn")
                .map_err(|e| format!("Failed to find symbol 'canBusOn': {:?}", e))?;
            let can_bus_off = lib.get::<unsafe extern "C" fn(i32) -> i32>(b"canBusOff")
                .map_err(|e| format!("Failed to find symbol 'canBusOff': {:?}", e))?;
            let can_read = lib.get::<unsafe extern "C" fn(i32, *mut i32, *mut u8, *mut u32, *mut u32, *mut u64) -> i32>(b"canRead")
                .map_err(|e| format!("Failed to find symbol 'canRead': {:?}", e))?;
            let can_write = lib.get::<unsafe extern "C" fn(i32, i32, *const u8, u32, u32) -> i32>(b"canWrite")
                .map_err(|e| format!("Failed to find symbol 'canWrite': {:?}", e))?;
            let can_get_channel_data = lib.get::<unsafe extern "C" fn(i32, i32, *mut std::ffi::c_void, usize) -> i32>(b"canGetChannelData")
                .map_err(|e| format!("Failed to find symbol 'canGetChannelData': {:?}", e))?;

            let can_enum_hardware_ex = match lib.get::<unsafe extern "C" fn(*mut i32) -> i32>(b"canEnumHardwareEx") {
                Ok(sym) => Some(*sym),
                Err(_) => None,
            };

            let can_initialize_library = *can_initialize_library;
            let can_get_number_of_channels = *can_get_number_of_channels;
            let can_open_channel = *can_open_channel;
            let can_close = *can_close;
            let can_set_bus_params = *can_set_bus_params;
            let can_bus_on = *can_bus_on;
            let can_bus_off = *can_bus_off;
            let can_read = *can_read;
            let can_write = *can_write;
            let can_get_channel_data = *can_get_channel_data;

            // Call library initialization
            can_initialize_library();

            Ok(Self {
                _lib: lib,
                _can_initialize_library: can_initialize_library,
                can_get_number_of_channels,
                can_enum_hardware_ex,
                can_open_channel,
                can_close,
                can_set_bus_params,
                can_bus_on,
                can_bus_off,
                can_read,
                can_write,
                can_get_channel_data,
            })
        }
    }
}

// Thread-safe OnceLock for CANlib to avoid reloading repeatedly
static CANLIB: OnceLock<Result<Canlib, String>> = OnceLock::new();

fn get_canlib() -> Result<&'static Canlib, String> {
    match CANLIB.get_or_init(Canlib::load).as_ref() {
        Ok(lib) => Ok(lib),
        Err(e) => Err(e.clone()),
    }
}

#[derive(serde::Serialize)]
pub struct KvaserConnectResult {
    pub device_name: String,
    pub channel: i32,
    pub is_virtual: bool,
}

/// Spawns a background thread to poll the Kvaser Leaf interface.
/// Returns KvaserConnectResult if successful, or Err if dynamic loading/connection fails.
#[tauri::command]
pub fn start_kvaser(app: AppHandle, baud_rate: u32, state: State<'_, KvaserState>) -> Result<KvaserConnectResult, String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Ok(KvaserConnectResult {
            device_name: "Kvaser Leaf (Already Connected)".to_string(),
            channel: 0,
            is_virtual: false,
        });
    }

    // Get CANlib or return library-not-found error
    let canlib = get_canlib()?;

    let mut num_channels = 0;
    let status = unsafe {
        if let Some(enum_hw) = canlib.can_enum_hardware_ex {
            enum_hw(&mut num_channels)
        } else {
            (canlib.can_get_number_of_channels)(&mut num_channels)
        }
    };
    if status < 0 {
        return Err(format!("Failed to retrieve/enumerate channel count (code {})", status));
    }
    if num_channels <= 0 {
        return Err("No Kvaser hardware channels detected. Make sure your Kvaser Leaf device is plugged in.".to_string());
    }

    let mut channel_opened = None;
    let mut opened_channel_idx = 0;
    let mut opened_device_name = String::new();
    let mut is_virtual = false;

    unsafe {
        // 1. Try to find a physical channel first (flag = 0)
        for ch in 0..num_channels {
            let handle = (canlib.can_open_channel)(ch, 0);
            if handle >= 0 {
                // Query properties of the opened channel to ensure it's not virtual
                let mut caps = 0u32;
                let cap_status = (canlib.can_get_channel_data)(
                    ch,
                    1, // canCHANNELDATA_CHANNEL_CAP
                    &mut caps as *mut _ as *mut std::ffi::c_void,
                    std::mem::size_of::<u32>(),
                );
                
                let mut card_type = 0u32;
                let type_status = (canlib.can_get_channel_data)(
                    ch,
                    4, // canCHANNELDATA_CARD_TYPE
                    &mut card_type as *mut _ as *mut std::ffi::c_void,
                    std::mem::size_of::<u32>(),
                );

                let mut buf = vec![0u8; 256];
                let name_status = (canlib.can_get_channel_data)(
                    ch,
                    26, // canCHANNELDATA_DEVDESCR_ASCII
                    buf.as_mut_ptr() as *mut std::ffi::c_void,
                    buf.len(),
                );
                let name = if name_status >= 0 {
                    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                    String::from_utf8_lossy(&buf[..len]).to_string()
                } else {
                    format!("Kvaser Channel {}", ch)
                };

                let is_virtual_cap = cap_status >= 0 && (caps & 0x00010000) != 0; // canCHANNEL_CAP_VIRTUAL = 0x00010000
                let is_virtual_type = type_status >= 0 && card_type == 1; // canHWTYPE_VIRTUAL = 1
                let is_virtual_name = name.to_lowercase().contains("virtual");

                if is_virtual_cap || is_virtual_type || is_virtual_name {
                    // Skip virtual channels in the physical scan phase
                    (canlib.can_close)(handle);
                    continue;
                }

                let freq_preset = match baud_rate {
                    125000 => -9,
                    250000 => -3,
                    500000 => -2,
                    1000000 => -1,
                    _ => -3,
                };
                
                let param_status = (canlib.can_set_bus_params)(handle, freq_preset, 0, 0, 0, 0, 0);
                if param_status >= 0 {
                    let bus_status = (canlib.can_bus_on)(handle);
                    if bus_status >= 0 {
                        channel_opened = Some(handle);
                        opened_channel_idx = ch;
                        opened_device_name = name;
                        break;
                    } else {
                        (canlib.can_close)(handle);
                    }
                } else {
                    (canlib.can_close)(handle);
                }
            }
        }

        // 2. Fallback to virtual channel (flag = canOPEN_ACCEPT_VIRTUAL)
        if channel_opened.is_none() {
            for ch in 0..num_channels {
                let handle = (canlib.can_open_channel)(ch, 0x0020);
                if handle >= 0 {
                    let freq_preset = match baud_rate {
                        125000 => -9,
                        250000 => -3,
                        500000 => -2,
                        1000000 => -1,
                        _ => -3,
                    };
                    
                    let param_status = (canlib.can_set_bus_params)(handle, freq_preset, 0, 0, 0, 0, 0);
                    if param_status >= 0 {
                        let bus_status = (canlib.can_bus_on)(handle);
                        if bus_status >= 0 {
                            let mut buf = vec![0u8; 256];
                            let data_status = (canlib.can_get_channel_data)(
                                ch,
                                26, // canCHANNELDATA_DEVDESCR_ASCII
                                buf.as_mut_ptr() as *mut std::ffi::c_void,
                                buf.len(),
                            );
                            let name = if data_status >= 0 {
                                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                                String::from_utf8_lossy(&buf[..len]).to_string()
                            } else {
                                format!("Kvaser Virtual Channel {}", ch)
                            };

                            channel_opened = Some(handle);
                            opened_channel_idx = ch;
                            opened_device_name = name;
                            is_virtual = true;
                            break;
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

    let handle_val = match channel_opened {
        Some(h) => h,
        None => {
            return Err("Kvaser driver found but failed to open or configure any CAN channel. Please check that the channel isn't already occupied by another application and that the baud rate is supported.".to_string());
        }
    };

    state.is_running.store(true, Ordering::SeqCst);
    let is_running = state.is_running.clone();
    let active_handle = state.active_handle.clone();

    // Store active handle
    {
        let mut h = active_handle.lock().unwrap();
        *h = Some(handle_val);
    }

    // Spawning listener thread
    thread::spawn(move || {
        if let Ok(canlib) = get_canlib() {
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

        // Reset state handle
        {
            let mut h = active_handle.lock().unwrap();
            *h = None;
        }
    });

    Ok(KvaserConnectResult {
        device_name: opened_device_name,
        channel: opened_channel_idx,
        is_virtual,
    })
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
        if let Ok(canlib) = get_canlib() {
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
