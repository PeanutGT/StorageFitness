// ============================================================================
// 執行檔：daemon.rs — 獨立的 UAC 高權限 Daemon 進程
// 負責人：🧠 Claude Opus 4.6
// 規範：此程式由主程式透過 ShellExecuteW (runas) 啟動，取得 Administrator 權限。
//       啟動後建立 Named Pipe Server，接收盤符，執行 MFT 掃描，
//       將結果序列化為 JSON 後透過 Pipe 傳回給主程式，然後自動退出。
//
// 使用方式：
//   storage-fitness-daemon.exe <pipe_name> <drive_letter>
//   例如：storage-fitness-daemon.exe \\.\pipe\StorageFitness_MFT_1234_abcdef C
//
// 安全守則：
//   - 僅透過明確的命令列參數接收 Pipe 名稱與盤符
//   - Pipe 配置為單一連線 (maxInstances = 1)
//   - 任務完成後立即退出，不駐留記憶體
// ============================================================================

// 在 Release 模式隱藏 Console 視窗
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::ffi::OsStr;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::FromRawHandle;
use std::path::PathBuf;

use tauri_app_lib::mft::{MftScanner, MftScannerConfig};
use tauri_app_lib::models::ScanProgressEvent;
use tauri_app_lib::scanner::DiskScanner;

use windows::core::PCWSTR;
use windows::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE,
    PIPE_WAIT,
};

/// Win32 常量 PIPE_ACCESS_DUPLEX = 0x00000003
/// 允許雙向讀寫，用於 CreateNamedPipeW 的 dwOpenMode 參數
const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;

fn main() {
    // 解析命令列參數
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "StorageFitness Daemon v0.1\n\
             Usage: {} <pipe_name> <drive_letter>\n\
             This executable is intended to be launched by the main StorageFitness application.",
            args.first().map(|s| s.as_str()).unwrap_or("storage-fitness-daemon")
        );
        std::process::exit(1);
    }

    let pipe_name = &args[1];
    let drive_letter = args[2].chars().next().unwrap_or('C');

    // 確認具備管理員權限
    if !MftScanner::check_admin_privilege().unwrap_or(false) {
        eprintln!("[Daemon] FATAL: Process does not have Administrator privileges.");
        std::process::exit(1);
    }

    // 建立 Named Pipe Server
    let pipe_name_wide: Vec<u16> = OsStr::new(pipe_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let h_pipe = unsafe {
        CreateNamedPipeW(
            PCWSTR(pipe_name_wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(PIPE_ACCESS_DUPLEX),
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1,                // maxInstances：僅允許單一連線
            1024 * 1024 * 64, // outBufferSize：64 MB（容納大型 JSON）
            1024,             // inBufferSize
            0,                // defaultTimeout
            None,             // securityAttributes（使用預設 DACL）
        )
    };

    if h_pipe == INVALID_HANDLE_VALUE {
        eprintln!("[Daemon] FATAL: Failed to create named pipe '{}'.", pipe_name);
        std::process::exit(1);
    }

    // 等待主程式 (Client) 連線
    let connect_result = unsafe { ConnectNamedPipe(h_pipe, None) };
    if connect_result.is_err() {
        // ERROR_PIPE_CONNECTED (535) 表示客戶端在 CreateNamedPipe 和 ConnectNamedPipe 之間已連接，
        // 這是正常行為，不需要視為錯誤
        let last_err = unsafe { windows::Win32::Foundation::GetLastError() };
        if last_err != windows::Win32::Foundation::ERROR_PIPE_CONNECTED {
            eprintln!(
                "[Daemon] FATAL: ConnectNamedPipe failed. Error: {:?}",
                last_err
            );
            std::process::exit(1);
        }
    }

    // 將 Win32 HANDLE 轉為 Rust std::fs::File 以便使用標準 Write trait
    let mut pipe_file = unsafe { std::fs::File::from_raw_handle(h_pipe.0 as _) };

    // 執行 MFT 掃描
    let config = MftScannerConfig {
        drive_letter,
        ..MftScannerConfig::default()
    };
    let scanner = MftScanner::new(config);
    let root = PathBuf::from(format!("{}:\\", drive_letter));

    // 進度回呼在此 Daemon 中暫時為 no-op，未來可透過 Pipe 串流
    let progress_sink: Box<dyn Fn(ScanProgressEvent) + Send + Sync> = Box::new(|_| {});
    let result = scanner.scan(&root, &*progress_sink);

    match result {
        Ok(tree) => {
            // 成功：序列化為 JSON 寫入 Pipe
            match serde_json::to_string(&tree) {
                Ok(json_str) => {
                    if let Err(e) = pipe_file.write_all(json_str.as_bytes()) {
                        eprintln!("[Daemon] ERROR: Failed to write result to pipe: {}", e);
                    }
                }
                Err(e) => {
                    let err_json = format!(r#"{{"error":"Serialization failed: {}"}}"#, e);
                    let _ = pipe_file.write_all(err_json.as_bytes());
                }
            }
        }
        Err(e) => {
            // 失敗：將錯誤訊息以 JSON 格式寫回
            let err_json = format!(r#"{{"error":"{}"}}"#, e);
            let _ = pipe_file.write_all(err_json.as_bytes());
        }
    }

    // Pipe File 在 drop 時自動關閉 Handle，Daemon 隨之退出
}
