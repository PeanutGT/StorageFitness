// ============================================================================
// 模組：models.rs — 核心資料模型 (IPC Contract Rust-Side Mirror)
// 負責人：🧠 Claude Opus 4.6
// 規範：嚴格對應架構師在 ipc-contracts.ts 中定義的介面，
//       欄位名稱透過 serde rename_all 轉換為 camelCase 以匹配前端。
// ============================================================================

use serde::{Deserialize, Serialize};

// ==========================================
// 1. 核心檔案系統節點模型 (MftRecordSummary)
// ==========================================

/// 對應前端 `MftRecordSummary` 介面。
/// 代表檔案系統中的一個節點（檔案或資料夾），用於 Treemap 視覺化渲染。
///
/// 當 `is_reparse_point` 為 `true` 時，`size_bytes` 僅記錄連結本體大小，
/// 且 `children` 必須為空（阻斷遞迴遍歷）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    /// 節點唯一識別碼（路徑的 hash 或 MFT 參考號）
    pub id: String,
    /// 節點名稱（檔案或資料夾名稱）
    pub name: String,
    /// 節點絕對路徑
    pub path: String,
    /// 實際佔用磁碟空間大小 (Bytes)
    pub size_bytes: u64,
    /// 是否為資料夾
    pub is_directory: bool,
    /// 是否為 Reparse Point (Symlink / Junction)
    /// 若為 true，掃描引擎不得遞迴進入此節點
    pub is_reparse_point: bool,
    /// 檔案擴展名（僅限檔案，資料夾為 None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    /// 資料夾層級深度（根目錄為 0）
    pub depth: u32,
    /// 子節點清單（僅限資料夾且非 Reparse Point）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

// ==========================================
// 2. 掃描進度事件模型 (ScanProgressEvent)
// ==========================================

/// 掃描引擎的狀態機
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScanStatus {
    Initializing,
    MftParsing,
    WalkingDir,
    BuildingTree,
    Completed,
    Error,
}

/// 對應前端 `ScanProgressEvent` 介面。
/// 掃描過程中透過 Tauri event 即時串流至前端更新 UI。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub status: ScanStatus,
    /// 已掃描的檔案總數
    pub files_scanned: u64,
    /// 已掃描的資料夾總數
    pub directories_scanned: u64,
    /// 當前正在掃描的磁碟或目錄路徑
    pub current_path: String,
    /// 耗時（毫秒）
    pub elapsed_ms: u64,
    /// 錯誤訊息（若有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

// ==========================================
// 3. 智慧清理規則模型 (CleanupRule)
// ==========================================

/// 清理操作的風險等級分級
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CleanupRiskLevel {
    /// 安全刪除，移至資源回收筒
    Safe,
    /// 中風險，先進入隔離區觀察
    Quarantine,
    /// 高風險，必須先建立系統還原點
    SystemRestoreRequired,
}

/// 對應前端 `CleanupRule` 介面。
/// 從 JSON/YAML 規則檔動態載入，支援 OTA 熱更新。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRule {
    /// 規則唯一識別碼（例如：'dev-node-modules'）
    pub rule_id: String,
    /// 人類可讀的規則名稱
    pub name: String,
    /// 規則描述
    pub description: String,
    /// 目標路徑 Glob 或正規表達式
    pub target_pattern: String,
    /// 風險等級
    pub risk_level: CleanupRiskLevel,
    /// 預估可釋放空間 (Bytes)，掃描後由引擎填寫
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_size: Option<u64>,
    /// 是否預設勾選（供 UI 使用）
    pub default_selected: bool,
}

/// 清理分析結果：包含更新後的規則清單，以及各規則所匹配到的具體實體路徑。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupAnalysisResult {
    /// 已經填寫 `estimated_size` 的規則陣列
    pub rules: Vec<CleanupRule>,
    /// `rule_id` -> [絕對路徑清單] 的對應表
    pub matched_paths: std::collections::HashMap<String, Vec<String>>,
}
