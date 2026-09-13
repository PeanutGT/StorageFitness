// ============================================================================
// 模組：scanner.rs — 非同步目錄遍歷掃描引擎 (Standard-Privilege Scanner)
// 負責人：🧠 Claude Opus 4.6
// 規範：此為「預設降權模式」掃描引擎，以標準用戶權限運行。
//       使用 walkdir 進行目錄遍歷，遇到 Reparse Point 時主動攔截並記錄。
//       不跟隨任何 Symlink/Junction，防止遞迴穿越攻擊。
// ============================================================================

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::Instant;

use crate::errors::{EngineError, EngineResult};
use crate::models::{FileNode, ScanProgressEvent, ScanStatus};
use crate::safety;

// ==========================================
// 1. 掃描引擎 Trait (供 MFT 引擎未來實作)
// ==========================================

/// 掃描引擎的統一介面。
/// 標準 WalkDir 掃描器與未來的 MFT 直讀引擎都必須實作此 trait。
pub trait DiskScanner {
    /// 掃描指定路徑，回傳完整的 FileNode 樹狀結構。
    ///
    /// # 參數
    /// - `root`: 要掃描的根目錄路徑
    /// - `progress_callback`: 接收掃描進度事件的回呼函式
    fn scan(
        &self,
        root: &Path,
        progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode>;
}

// ==========================================
// 2. 標準權限目錄遍歷引擎 (WalkDir Scanner)
// ==========================================

/// 基於 `walkdir` 的標準權限掃描引擎。
///
/// 此引擎在標準用戶權限下運行，無需 UAC 提權。
/// 它透過 `std::fs::symlink_metadata` 讀取檔案屬性，
/// 並在偵測到 `FILE_ATTRIBUTE_REPARSE_POINT` 時主動跳過該子樹。
pub struct StandardScanner {
    /// 進度報告的批次間隔（每掃描 N 個項目報告一次）
    progress_batch_size: u64,
}

impl StandardScanner {
    /// 建立新的標準掃描器實例。
    ///
    /// # 參數
    /// - `progress_batch_size`: 每掃描多少個項目就發送一次進度事件（預設 1000）
    pub fn new(progress_batch_size: u64) -> Self {
        Self {
            progress_batch_size,
        }
    }

    /// 為路徑產生穩定的唯一識別碼（基於路徑字串的 hash）。
    fn path_to_id(path: &Path) -> String {
        let mut hasher = DefaultHasher::new();
        path.to_string_lossy().hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    /// 取得檔案大小。對於 Reparse Point 或無法讀取的項目回傳 0。
    #[allow(dead_code)]
    fn get_file_size(path: &Path) -> u64 {
        std::fs::symlink_metadata(path)
            .map(|m| m.len())
            .unwrap_or(0)
    }

    /// 取得檔案擴展名（小寫化）。
    fn get_extension(path: &Path) -> Option<String> {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
    }

    /// 遞迴建構 FileNode 樹。
    ///
    /// 此函式是掃描引擎的核心邏輯：
    /// 1. 讀取目標目錄的所有直接子項目
    /// 2. 對每個子項目檢查是否為 Reparse Point
    /// 3. 若是 Reparse Point：記錄但不遞迴，size 僅記錄連結本身
    /// 4. 若是普通資料夾：遞迴進入建構子樹
    /// 5. 若是檔案：直接記錄大小與擴展名
    fn build_tree(
        &self,
        root: &Path,
        depth: u32,
        files_scanned: &mut u64,
        dirs_scanned: &mut u64,
        start_time: &Instant,
        progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        let is_reparse = safety::is_reparse_point(root);
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());

        // 若自身就是 Reparse Point，僅記錄本體，嚴禁遞迴
        if is_reparse {
            *dirs_scanned += 1;
            return Ok(FileNode {
                id: Self::path_to_id(root),
                name,
                path: root.to_string_lossy().to_string(),
                size_bytes: 0, // Reparse Point 不計算真實目標大小
                is_directory: true,
                is_reparse_point: true,
                extension: None,
                depth,
                children: None, // 關鍵：無子節點，阻斷遍歷
            });
        }

        // 讀取目錄的直接子項目（不使用 walkdir 遞迴，手動控制遞迴深度）
        let entries = match std::fs::read_dir(root) {
            Ok(entries) => entries,
            Err(_err) => {
                // 權限不足或路徑不存在等情況：回傳空資料夾節點而非崩潰
                return Ok(FileNode {
                    id: Self::path_to_id(root),
                    name,
                    path: root.to_string_lossy().to_string(),
                    size_bytes: 0,
                    is_directory: true,
                    is_reparse_point: false,
                    extension: None,
                    depth,
                    children: Some(Vec::new()),
                });
            }
        };

        let mut children = Vec::new();
        let mut total_size: u64 = 0;

        for entry_result in entries {
            let entry = match entry_result {
                Ok(e) => e,
                Err(_) => continue, // 跳過無法讀取的項目
            };

            let entry_path = entry.path();

            // 發送進度事件（批次模式）
            let total_items = *files_scanned + *dirs_scanned;
            if total_items % self.progress_batch_size == 0 && total_items > 0 {
                progress_callback(ScanProgressEvent {
                    status: ScanStatus::WalkingDir,
                    files_scanned: *files_scanned,
                    directories_scanned: *dirs_scanned,
                    current_path: entry_path.to_string_lossy().to_string(),
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                    error_message: None,
                });
            }

            // 判斷項目類型（使用 symlink_metadata 避免跟隨連結）
            let metadata = match std::fs::symlink_metadata(&entry_path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            if metadata.is_dir() {
                // 遞迴處理子目錄（build_tree 內部會處理 Reparse Point 攔截）
                match self.build_tree(
                    &entry_path,
                    depth + 1,
                    files_scanned,
                    dirs_scanned,
                    start_time,
                    progress_callback,
                ) {
                    Ok(child_node) => {
                        total_size += child_node.size_bytes;
                        children.push(child_node);
                    }
                    Err(EngineError::ProtectedPathViolation { .. }) => {
                        // 靜默跳過受保護路徑，不中斷掃描
                        continue;
                    }
                    Err(_) => {
                        // 其他錯誤也跳過，確保掃描不因單一子樹錯誤而崩潰
                        continue;
                    }
                }
            } else {
                // 檔案節點
                *files_scanned += 1;
                let file_size = metadata.len();
                total_size += file_size;

                children.push(FileNode {
                    id: Self::path_to_id(&entry_path),
                    name: entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    path: entry_path.to_string_lossy().to_string(),
                    size_bytes: file_size,
                    is_directory: false,
                    is_reparse_point: false,
                    extension: Self::get_extension(&entry_path),
                    depth: depth + 1,
                    children: None,
                });
            }
        }

        *dirs_scanned += 1;

        // 按大小降序排列子節點（方便前端 Treemap 渲染時優先繪製大區塊）
        children.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

        Ok(FileNode {
            id: Self::path_to_id(root),
            name,
            path: root.to_string_lossy().to_string(),
            size_bytes: total_size,
            is_directory: true,
            is_reparse_point: false,
            extension: None,
            depth,
            children: Some(children),
        })
    }
}

impl DiskScanner for StandardScanner {
    fn scan(
        &self,
        root: &Path,
        progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        // 安全閘門：檢查根路徑是否觸及禁區
        safety::check_path_safety(root)?;

        let start_time = Instant::now();
        let mut files_scanned: u64 = 0;
        let mut dirs_scanned: u64 = 0;

        // 發送初始化事件
        progress_callback(ScanProgressEvent {
            status: ScanStatus::Initializing,
            files_scanned: 0,
            directories_scanned: 0,
            current_path: root.to_string_lossy().to_string(),
            elapsed_ms: 0,
            error_message: None,
        });

        // 建構檔案樹
        progress_callback(ScanProgressEvent {
            status: ScanStatus::WalkingDir,
            files_scanned: 0,
            directories_scanned: 0,
            current_path: root.to_string_lossy().to_string(),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            error_message: None,
        });

        let tree = self.build_tree(
            root,
            0,
            &mut files_scanned,
            &mut dirs_scanned,
            &start_time,
            progress_callback,
        )?;

        // 發送完成事件
        progress_callback(ScanProgressEvent {
            status: ScanStatus::Completed,
            files_scanned,
            directories_scanned: dirs_scanned,
            current_path: root.to_string_lossy().to_string(),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            error_message: None,
        });

        Ok(tree)
    }
}

// ==========================================
// 3. 單元測試
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_scanner_creates_tree_for_temp_dir() {
        let temp_dir = std::env::temp_dir().join("disk_analyzer_test_scan");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(temp_dir.join("subdir")).expect("Failed to create test dirs");
        fs::write(temp_dir.join("file1.txt"), "hello").expect("Failed to write test file");
        fs::write(temp_dir.join("subdir").join("file2.rs"), "fn main() {}")
            .expect("Failed to write test file");

        let scanner = StandardScanner::new(100);
        let mut progress_events = Vec::new();

        let result = scanner.scan(&temp_dir, &|event| {
            progress_events.push(event);
        });

        assert!(result.is_ok());
        let tree = result.expect("scan should succeed");
        assert!(tree.is_directory);
        assert!(!tree.is_reparse_point);
        assert!(tree.size_bytes > 0);
        assert!(tree.children.is_some());

        // 驗證進度事件有發送
        assert!(!progress_events.is_empty());
        // 最後一個事件應為 Completed
        assert_eq!(
            progress_events.last().map(|e| &e.status),
            Some(&ScanStatus::Completed)
        );

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scanner_rejects_protected_path() {
        let scanner = StandardScanner::new(100);
        let protected = PathBuf::from(r"C:\Windows\System32");

        let result = scanner.scan(&protected, &|_| {});
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            EngineError::ProtectedPathViolation { .. }
        ));
    }

    #[test]
    fn test_path_to_id_is_deterministic() {
        let path = Path::new(r"C:\Users\test\file.txt");
        let id1 = StandardScanner::path_to_id(path);
        let id2 = StandardScanner::path_to_id(path);
        assert_eq!(id1, id2);
        assert_eq!(id1.len(), 16); // 16 hex chars
    }

    #[test]
    fn test_get_extension_extracts_correctly() {
        assert_eq!(
            StandardScanner::get_extension(Path::new("file.TXT")),
            Some("txt".to_string())
        );
        assert_eq!(
            StandardScanner::get_extension(Path::new("file.rs")),
            Some("rs".to_string())
        );
        assert_eq!(
            StandardScanner::get_extension(Path::new("no_extension")),
            None
        );
    }
}
