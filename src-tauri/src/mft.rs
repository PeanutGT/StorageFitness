// ============================================================================
// 模組：mft.rs — NTFS $MFT 直讀引擎介面 (Trait & Placeholder)
// 負責人：🧠 Claude Opus 4.6
// 規範：此模組定義 MFT 引擎的公開介面 (Trait)。
//       完整的二進位解析實作將在後續 Phase 中填入。
//       MFT 引擎需要管理員權限（UAC 提權後才可使用）。
// ============================================================================

use std::path::Path;

use crate::errors::{EngineError, EngineResult};
use crate::models::{FileNode, ScanProgressEvent};
use crate::scanner::DiskScanner;

// ==========================================
// 1. MFT 引擎介面定義
// ==========================================

/// NTFS $MFT 直讀引擎的專屬配置。
pub struct MftScannerConfig {
    /// 目標 NTFS Volume（例如 `\\.\C:`）
    pub volume_path: String,
    /// 是否解析 Non-resident Data Runs（完整大小計算需要）
    pub parse_data_runs: bool,
    /// MFT Record 批次解析大小（影響記憶體使用）
    pub batch_size: usize,
}

impl Default for MftScannerConfig {
    fn default() -> Self {
        Self {
            volume_path: String::from(r"\\.\C:"),
            parse_data_runs: true,
            batch_size: 4096,
        }
    }
}

/// NTFS $MFT 直讀掃描引擎。
///
/// # 設計說明
/// 此引擎直接讀取 NTFS 磁區的 $MFT (Master File Table)，
/// 繞過 Win32 File API 的逐檔案查詢開銷，實現數秒內全磁碟解析。
///
/// # 權限需求
/// 必須以管理員權限運行（需 UAC 提權），因為直接開啟 Volume Handle
/// 需要 `SE_BACKUP_PRIVILEGE` 或 `GENERIC_READ` on `\\.\C:`。
///
/// # 安全不變量 (Safety Invariants)
/// - 所有 Win32 Handle 透過 RAII (Drop trait) 自動釋放
/// - MFT Record 的 Fixup Array 校驗必須通過才進行解析
/// - Reparse Point 屬性 ($REPARSE_POINT attribute) 被偵測到時，
///   該 Record 的子節點遍歷將被阻斷
pub struct MftScanner {
    #[allow(dead_code)]
    config: MftScannerConfig,
}

impl MftScanner {
    /// 建立新的 MFT 掃描器實例。
    pub fn new(config: MftScannerConfig) -> Self {
        Self { config }
    }

    /// 檢查當前進程是否具有管理員權限。
    ///
    /// # 實作計畫
    /// 將透過 `CheckTokenMembership` Win32 API 檢查
    /// 當前 Token 是否屬於 BUILTIN\Administrators 群組。
    pub fn check_admin_privilege() -> EngineResult<bool> {
        // TODO(Phase 3): 實作 Win32 Token 檢查
        // 目前回傳 false，表示尚未實作權限偵測
        Ok(false)
    }

    /// 開啟 NTFS Volume 的原始 Handle。
    ///
    /// # 安全說明
    /// 此函式將使用 `CreateFileW` 開啟 `\\.\C:` 等 Volume，
    /// 所有 HANDLE 資源將透過自訂的 `SafeHandle` wrapper 確保 Drop 時關閉。
    fn open_volume_handle(&self) -> EngineResult<()> {
        // TODO(Phase 3): 實作 Volume Handle 開啟
        Err(EngineError::MftParseError(
            "MFT engine not yet implemented — use StandardScanner as fallback".to_string(),
        ))
    }

    /// 讀取並解析 $MFT 的所有 Record。
    ///
    /// # 演算法概要
    /// 1. 讀取 Boot Sector 取得 MFT 起始 LCN 與 Record 大小
    /// 2. 從 $MFT Record #0 取得 $DATA attribute 的 Data Runs
    /// 3. 依序讀取所有 MFT Record（通常為 1024 bytes/record）
    /// 4. 對每個 Record：
    ///    a. 校驗 Fixup Array
    ///    b. 解析 $FILE_NAME attribute 建構父子關係
    ///    c. 解析 $DATA attribute 取得檔案大小
    ///    d. 偵測 $REPARSE_POINT attribute 標記為 Reparse Point
    fn parse_mft_records(&self) -> EngineResult<Vec<FileNode>> {
        // TODO(Phase 3): 實作完整的 MFT 二進位解析
        Err(EngineError::MftParseError(
            "MFT record parsing not yet implemented".to_string(),
        ))
    }
}

impl DiskScanner for MftScanner {
    /// 以 MFT 直讀方式掃描磁碟。
    ///
    /// # 當前狀態
    /// 此為 Placeholder 實作，會回傳明確的錯誤訊息引導使用者
    /// 切換至 StandardScanner。完整實作將在 Phase 3 中由 Claude Opus 4.6 填入。
    fn scan(
        &self,
        _root: &Path,
        _progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        // 步驟 1: 檢查管理員權限
        let has_admin = Self::check_admin_privilege()?;
        if !has_admin {
            return Err(EngineError::MftParseError(
                "MFT direct read requires administrator privileges. \
                 Please re-launch with UAC elevation or use the standard scanner."
                    .to_string(),
            ));
        }

        // 步驟 2: 開啟 Volume Handle
        self.open_volume_handle()?;

        // 步驟 3: 解析 MFT Records
        let _records = self.parse_mft_records()?;

        // TODO(Phase 3): 將扁平的 MFT Records 重建為 FileNode 樹狀結構
        Err(EngineError::MftParseError(
            "MFT tree reconstruction not yet implemented".to_string(),
        ))
    }
}

// ==========================================
// 2. 單元測試
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_mft_scanner_returns_not_implemented_error() {
        let scanner = MftScanner::new(MftScannerConfig::default());
        let root = PathBuf::from(r"C:\");
        let result = scanner.scan(&root, &|_| {});
        assert!(result.is_err());
        // 應該回傳 MftParseError（因為尚未實作）
        match result.unwrap_err() {
            EngineError::MftParseError(msg) => {
                assert!(msg.contains("administrator") || msg.contains("not yet implemented"));
            }
            other => panic!("Expected MftParseError, got: {:?}", other),
        }
    }

    #[test]
    fn test_mft_config_default_values() {
        let config = MftScannerConfig::default();
        assert_eq!(config.volume_path, r"\\.\C:");
        assert!(config.parse_data_runs);
        assert_eq!(config.batch_size, 4096);
    }

    #[test]
    fn test_check_admin_privilege_returns_false_placeholder() {
        let result = MftScanner::check_admin_privilege();
        assert!(result.is_ok());
        assert!(!result.expect("should be Ok"));
    }
}
