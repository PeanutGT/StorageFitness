// ============================================================================
// 根模組：lib.rs — Tauri 應用程式入口點與模組註冊
// 負責人：🧠 Claude Opus 4.6
// 規範：此檔案負責註冊所有 Rust 模組，並透過 Tauri Command 系統
//       將掃描功能暴露給前端 WebView。
// ============================================================================

pub mod errors;
pub mod mft;
pub mod models;
pub mod rules;
pub mod safety;
pub mod scanner;

use std::path::PathBuf;

use crate::errors::EngineError;
use crate::models::ScanProgressEvent;
use crate::scanner::{DiskScanner, StandardScanner};

// ==========================================
// Tauri Commands (前端 IPC 橋接)
// ==========================================

/// 標準權限掃描指令。
///
/// 前端透過 `invoke('scan_directory', { path: '...' })` 呼叫此函式。
/// 回傳完整的 FileNode 樹狀結構（JSON 序列化後傳回 WebView）。
#[tauri::command]
fn scan_directory(path: String) -> Result<models::FileNode, String> {
    let root = PathBuf::from(&path);

    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let scanner = StandardScanner::new(1000);

    // 目前先收集進度事件，後續整合 Tauri Event 系統做即時串流
    let progress_log: std::sync::Arc<std::sync::Mutex<Vec<ScanProgressEvent>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));

    let log_clone = progress_log.clone();
    let result = scanner.scan(&root, &move |event| {
        if let Ok(mut log) = log_clone.lock() {
            log.push(event);
        }
    });

    match result {
        Ok(tree) => Ok(tree),
        Err(EngineError::ProtectedPathViolation { path }) => {
            Err(format!("Access denied: '{}' is a protected system path", path))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// 檢查指定路徑的安全狀態。
///
/// 前端在用戶選擇清理目標前，可先呼叫此指令確認路徑是否安全。
#[tauri::command]
fn check_path_safety(path: String) -> Result<bool, String> {
    let target = PathBuf::from(&path);
    match safety::check_path_safety(&target) {
        Ok(()) => Ok(true),
        Err(EngineError::ProtectedPathViolation { .. }) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// 檢查指定路徑是否為 Reparse Point (Symlink / Junction)。
#[tauri::command]
fn is_reparse_point(path: String) -> bool {
    let target = PathBuf::from(&path);
    safety::is_reparse_point(&target)
}

/// 透過 HTTP 從官方雲端倉庫 (OTA) 下載最新的 JSON 規則庫。
#[tauri::command]
async fn update_cleanup_rules() -> Result<Vec<rules::CleanupRule>, String> {
    match rules::RulesEngine::fetch_ota_rules().await {
        Ok(rules) => Ok(rules),
        Err(e) => Err(e.to_string()),
    }
}

/// 傳入現有樹狀結構與規則，精算每個規則實際匹配的總容量。
#[tauri::command]
fn analyze_cleanup_targets(
    tree: models::FileNode,
    rules: Vec<rules::CleanupRule>,
) -> Vec<rules::CleanupRule> {
    rules::RulesEngine::analyze_cleanup_targets(&tree, &rules)
}

// ==========================================
// Tauri Application Bootstrap
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            check_path_safety,
            is_reparse_point,
            update_cleanup_rules,
            analyze_cleanup_targets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
