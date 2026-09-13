// ============================================================================
// 模組：errors.rs — 強型別錯誤鏈 (Error Hierarchy)
// 負責人：🧠 Claude Opus 4.6
// 規範：全專案唯一錯誤根節點，嚴禁任何 unwrap() 或 panic!()
// ============================================================================

use thiserror::Error;

/// 核心引擎頂層錯誤類型
///
/// 所有底層模組的錯誤都必須透過此 enum 統一向上傳播，
/// 確保前端（透過 Tauri IPC）收到的錯誤訊息結構一致且可解讀。
#[derive(Debug, Error)]
pub enum EngineError {
    /// 檔案系統 I/O 操作失敗（路徑存取、權限不足等）
    #[error("filesystem I/O error at '{path}': {source}")]
    IoError {
        path: String,
        source: std::io::Error,
    },

    /// 目錄遍歷過程中遭遇的錯誤（walkdir 回傳）
    #[error("directory walk error: {0}")]
    WalkError(String),

    /// 路徑觸及絕對保護禁區（Hard Whitelist 攔截）
    #[error("access denied: path '{path}' is within a protected system zone")]
    ProtectedPathViolation { path: String },

    /// 遭遇 Reparse Point (Symlink / Junction) 且被防護機制攔截
    #[error("reparse point detected and blocked at '{path}'")]
    ReparsePointBlocked { path: String },

    /// MFT 解析器相關錯誤
    #[error("MFT parsing error: {0}")]
    MftParseError(String),

    /// Win32 API 呼叫失敗
    #[error("Win32 API error in '{operation}': {message}")]
    Win32Error { operation: String, message: String },

    /// 序列化 / 反序列化失敗
    #[error("serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

/// 從 walkdir::Error 轉換，避免在掃描迴圈中使用 unwrap
impl From<walkdir::Error> for EngineError {
    fn from(err: walkdir::Error) -> Self {
        EngineError::WalkError(err.to_string())
    }
}

/// 引擎操作的統一 Result 類型別名
pub type EngineResult<T> = Result<T, EngineError>;
