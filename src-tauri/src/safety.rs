// ============================================================================
// 模組：safety.rs — 零信任安全防護層 (Safety Gates)
// 負責人：🧠 Claude Opus 4.6
// 規範：此模組包含絕對保護白名單與 Reparse Point 偵測，
//       是掃描引擎與清理引擎之間的安全屏障，不可繞過。
// ============================================================================

use std::path::Path;

use crate::errors::{EngineError, EngineResult};

// ==========================================
// 1. 絕對保護禁區 (Hard-Coded Protected Paths)
// ==========================================

/// 系統核心保護路徑前綴（大小寫不敏感比對）。
/// 任何掃描或清理操作若觸及這些路徑，將被立即阻斷。
///
/// 注意：此清單以系統磁碟機 (通常為 C:\) 為基準，
/// 實際比對時會動態取得 `%SystemDrive%` 環境變數。
const PROTECTED_PREFIXES: &[&str] = &[
    r"\Windows\System32",
    r"\Windows\WinSxS",
    r"\Windows\Boot",
    r"\Boot",
    r"\EFI",
];

/// 系統核心保護檔案名稱（位於系統磁碟機根目錄）。
const PROTECTED_ROOT_FILES: &[&str] = &[
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
];

/// 取得系統磁碟機代號（例如 "C:"）。
/// 優先讀取 `%SystemDrive%` 環境變數，若不存在則回退至 "C:"。
fn get_system_drive() -> String {
    std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string())
}

/// 檢查給定路徑是否位於絕對保護禁區。
///
/// # 回傳
/// - `Ok(())` 若路徑安全可操作
/// - `Err(EngineError::ProtectedPathViolation)` 若路徑觸及禁區
pub fn check_path_safety(path: &Path) -> EngineResult<()> {
    let path_str = path.to_string_lossy();
    let system_drive = get_system_drive();

    // 檢查系統核心目錄前綴
    for prefix in PROTECTED_PREFIXES {
        let full_prefix = format!("{}{}", system_drive, prefix);
        if path_str
            .to_ascii_lowercase()
            .starts_with(&full_prefix.to_ascii_lowercase())
        {
            return Err(EngineError::ProtectedPathViolation {
                path: path_str.to_string(),
            });
        }
    }

    // 檢查系統磁碟機根目錄下的保護檔案
    for protected_file in PROTECTED_ROOT_FILES {
        let full_path = format!("{}\\{}", system_drive, protected_file);
        if path_str
            .eq_ignore_ascii_case(&full_path)
        {
            return Err(EngineError::ProtectedPathViolation {
                path: path_str.to_string(),
            });
        }
    }

    Ok(())
}

// ==========================================
// 2. Reparse Point 偵測 (Symlink / Junction Guard)
// ==========================================

/// 檢查指定路徑是否為 Windows Reparse Point (Symlink 或 Junction)。
///
/// 此函式讀取檔案的 metadata（不跟隨符號連結），
/// 並檢查 `FILE_ATTRIBUTE_REPARSE_POINT` 旗標。
///
/// # 平台說明
/// - Windows：使用 `std::fs::symlink_metadata` 讀取 dwFileAttributes
/// - 非 Windows：永遠回傳 `false`（此專案僅針對 Windows，但保持可編譯性）
pub fn is_reparse_point(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;

        match std::fs::symlink_metadata(path) {
            Ok(metadata) => metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0,
            // 若無法讀取 metadata，保守判定為非 reparse point，
            // 但掃描引擎會在後續 I/O 操作中捕獲實際錯誤
            Err(_) => false,
        }
    }

    #[cfg(not(windows))]
    {
        // 非 Windows 平台：檢查是否為符號連結
        path.symlink_metadata()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
    }
}

// ==========================================
// 3. 單元測試
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_protected_system32_is_blocked() {
        let path = PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts");
        let result = check_path_safety(&path);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            EngineError::ProtectedPathViolation { .. }
        ));
    }

    #[test]
    fn test_protected_winsxs_is_blocked() {
        let path = PathBuf::from(r"C:\Windows\WinSxS\some_assembly");
        let result = check_path_safety(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_protected_pagefile_is_blocked() {
        let path = PathBuf::from(r"C:\pagefile.sys");
        let result = check_path_safety(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_protected_hiberfil_is_blocked() {
        let path = PathBuf::from(r"C:\hiberfil.sys");
        let result = check_path_safety(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_safe_user_path_is_allowed() {
        let path = PathBuf::from(r"C:\Users\Someone\Documents\project");
        let result = check_path_safety(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_safe_temp_path_is_allowed() {
        let path = PathBuf::from(r"D:\Temp\some_cache");
        let result = check_path_safety(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_protected_path_case_insensitive() {
        let path = PathBuf::from(r"c:\windows\system32\config");
        let result = check_path_safety(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_efi_partition_is_blocked() {
        let path = PathBuf::from(r"C:\EFI\Microsoft\Boot");
        let result = check_path_safety(&path);
        assert!(result.is_err());
    }
}
