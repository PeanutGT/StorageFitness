// ============================================================================
// 模組：mft_ipc.rs — UAC 提權觸發與 Named Pipes IPC 客戶端
// 負責人：🧠 Claude Opus 4.6
// 規範：此模組封裝了 Windows UAC 提權邏輯與 Named Pipes 跨進程通訊。
//       當主程式不具備管理員權限時，透過 ShellExecuteW (runas) 啟動
//       高權限的 storage-fitness-daemon.exe，並透過 Named Pipe 接收
//       MFT 掃描結果。
//
// 安全守則：
//   - Pipe 名稱包含 PID + 隨機 nonce 防止劫持
//   - 連線超時 30 秒，防止無限等待
//   - 所有 unsafe 僅限 Win32 FFI 呼叫
// ============================================================================

use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::errors::EngineError;
use crate::models::FileNode;

/// Named Pipe 連線嘗試的最大超時時間（30 秒，給使用者充足時間點擊 UAC「是」）
const PIPE_CONNECT_TIMEOUT_SECS: u64 = 30;

/// 每次連線嘗試之間的間隔（毫秒）
const PIPE_RETRY_INTERVAL_MS: u64 = 200;

/// 透過 UAC 提權 Daemon 執行 MFT 掃描。
///
/// 此函式在主程式不具備管理員權限時被呼叫：
/// 1. 生成唯一的 Named Pipe 名稱
/// 2. 透過 ShellExecuteW (runas) 啟動 Daemon
/// 3. 連接 Named Pipe，讀取掃描結果
/// 4. 反序列化 JSON 為 FileNode 並回傳
pub fn request_mft_scan_via_daemon(drive_letter: char) -> Result<FileNode, EngineError> {
    let pipe_name = generate_pipe_name();
    
    // 取得 Daemon 執行檔路徑
    let daemon_path = find_daemon_executable()?;
    
    // 透過 UAC 提權啟動 Daemon
    launch_elevated_daemon(&daemon_path, &pipe_name, drive_letter)?;
    
    // 連接 Named Pipe 並讀取結果
    let json_data = connect_and_read_pipe(&pipe_name)?;
    
    // 解析 JSON 結果
    parse_daemon_response(&json_data)
}

/// 生成唯一的 Named Pipe 名稱，格式：\\.\pipe\StorageFitness_MFT_<PID>_<NONCE>
fn generate_pipe_name() -> String {
    let pid = std::process::id();
    let nonce: u64 = {
        // 使用系統時間作為簡單隨機源（不需要加密安全性）
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        now.as_nanos() as u64 ^ (pid as u64 * 2654435761)
    };
    format!(r"\\.\pipe\StorageFitness_MFT_{}_{:x}", pid, nonce)
}

/// 尋找 storage-fitness-daemon.exe 的路徑。
/// 優先從當前執行檔所在目錄找，其次從 target/debug 目錄找。
fn find_daemon_executable() -> Result<PathBuf, EngineError> {
    let daemon_name = "storage-fitness-daemon.exe";
    
    // 策略 1：與主程式同目錄（生產環境）
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidate = exe_dir.join(daemon_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }
    
    // 策略 2：cargo target/debug 目錄（開發環境）
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let debug_candidate = PathBuf::from(manifest_dir)
        .join("target")
        .join("debug")
        .join(daemon_name);
    if debug_candidate.exists() {
        return Ok(debug_candidate);
    }
    
    // 策略 3：上一層的 target/debug（Tauri 建置結構）
    let parent_target = PathBuf::from(manifest_dir)
        .parent()
        .map(|p| p.join("src-tauri").join("target").join("debug").join(daemon_name));
    if let Some(ref candidate) = parent_target {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(EngineError::MftParseError(format!(
        "Cannot find daemon executable '{}'. Please ensure the project is built first.",
        daemon_name
    )))
}

/// 透過 Windows ShellExecuteW API 以 `runas` 動詞啟動 Daemon 進程。
/// 這會觸發 Windows 內建的 UAC 提權對話框。
#[cfg(windows)]
fn launch_elevated_daemon(
    daemon_path: &PathBuf,
    pipe_name: &str,
    drive_letter: char,
) -> Result<(), EngineError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

    // 將路徑轉為 Wide String
    let exe_wide: Vec<u16> = OsStr::new(daemon_path.as_os_str())
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // 構建參數字串：<pipe_name> <drive_letter>
    let params = format!("{} {}", pipe_name, drive_letter);
    let params_wide: Vec<u16> = OsStr::new(&params)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // "runas" 動詞觸發 UAC
    let verb: Vec<u16> = OsStr::new("runas")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let result = unsafe {
        ShellExecuteW(
            None,                           // hwnd
            PCWSTR(verb.as_ptr()),           // lpOperation = "runas"
            PCWSTR(exe_wide.as_ptr()),       // lpFile
            PCWSTR(params_wide.as_ptr()),    // lpParameters
            PCWSTR::null(),                  // lpDirectory
            SW_HIDE,                         // nShowCmd (隱藏 Daemon 視窗)
        )
    };

    // ShellExecuteW 回傳值 > 32 表示成功
    let result_code = result.0 as isize;
    if result_code <= 32 {
        // 常見錯誤碼：
        // 5 = ERROR_ACCESS_DENIED (使用者在 UAC 點擊「否」)
        // 2 = ERROR_FILE_NOT_FOUND
        if result_code == 5 {
            return Err(EngineError::InsufficientPrivilege(
                "使用者拒絕了 UAC 提權請求。請在系統管理員權限對話框中點擊「是」以啟用 MFT 極速掃描。".to_string()
            ));
        }
        return Err(EngineError::Win32Error {
            operation: "ShellExecuteW (runas)".to_string(),
            message: format!(
                "Failed to launch elevated daemon. Error code: {}. Path: {:?}",
                result_code,
                daemon_path
            ),
        });
    }

    Ok(())
}

#[cfg(not(windows))]
fn launch_elevated_daemon(
    _daemon_path: &PathBuf,
    _pipe_name: &str,
    _drive_letter: char,
) -> Result<(), EngineError> {
    Err(EngineError::MftParseError(
        "UAC elevation is only available on Windows.".to_string(),
    ))
}

/// 連接 Named Pipe 並讀取 Daemon 傳回的完整 JSON 資料。
///
/// 此函式會在最多 30 秒的時間窗口內反覆嘗試連接 Pipe，
/// 因為 Daemon 在接收到 UAC 授權後才會建立 Pipe Server。
fn connect_and_read_pipe(pipe_name: &str) -> Result<String, EngineError> {
    let start = Instant::now();
    let timeout = Duration::from_secs(PIPE_CONNECT_TIMEOUT_SECS);
    let retry_interval = Duration::from_millis(PIPE_RETRY_INTERVAL_MS);

    // 迴圈嘗試連接，直到成功或超時
    let mut pipe_file = loop {
        match std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(pipe_name)
        {
            Ok(file) => break file,
            Err(e) => {
                if start.elapsed() >= timeout {
                    return Err(EngineError::Win32Error {
                        operation: "ConnectNamedPipe (client)".to_string(),
                        message: format!(
                            "Timed out ({} secs) waiting for daemon pipe '{}'. \
                             The user may have cancelled the UAC prompt, or the daemon \
                             failed to start. Last error: {}",
                            PIPE_CONNECT_TIMEOUT_SECS, pipe_name, e
                        ),
                    });
                }
                std::thread::sleep(retry_interval);
            }
        }
    };

    // 讀取全部資料（Daemon 寫完就會關閉 Pipe，觸發 EOF）
    let mut buffer = String::new();
    pipe_file.read_to_string(&mut buffer).map_err(|e| EngineError::IoError {
        path: pipe_name.to_string(),
        source: e,
    })?;

    if buffer.is_empty() {
        return Err(EngineError::MftParseError(
            "Daemon returned empty response via pipe.".to_string(),
        ));
    }

    Ok(buffer)
}

/// 解析 Daemon 傳回的 JSON 資料。
/// Daemon 可能回傳成功的 FileNode，或帶有 "error" 欄位的錯誤物件。
fn parse_daemon_response(json_data: &str) -> Result<FileNode, EngineError> {
    // 先嘗試解析為錯誤物件
    if let Ok(err_obj) = serde_json::from_str::<serde_json::Value>(json_data) {
        if let Some(err_msg) = err_obj.get("error").and_then(|v| v.as_str()) {
            return Err(EngineError::MftParseError(format!(
                "Daemon reported error: {}",
                err_msg
            )));
        }
    }

    // 正常解析為 FileNode
    serde_json::from_str::<FileNode>(json_data).map_err(|e| {
        EngineError::SerializationError(e)
    })
}
