// ============================================================================
// 模組：cleaner.rs — 安全刪除引擎 (IFileOperation)
// 負責人：🧠 Claude Opus 4.6 (由 Gemini 3.1 Pro 實作 Phase 5.2)
// 規範：此模組封裝 Windows 資源回收筒 API，實現零風險「移至資源回收筒」刪除。
// ============================================================================

use std::path::PathBuf;
use windows::core::HSTRING;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    FileOperation, IFileOperation, IShellItem, SHCreateItemFromParsingName, FOF_ALLOWUNDO,
    FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
};

use crate::errors::{EngineError, EngineResult};
use crate::safety;

pub struct CleanerEngine;

impl CleanerEngine {
    /// 將指定路徑清單移至 Windows 資源回收筒
    ///
    /// 內部使用 `IFileOperation` COM API，並開啟撤銷 (`FOF_ALLOWUNDO`) 功能。
    pub fn move_to_recycle_bin(paths: Vec<String>) -> EngineResult<()> {
        if paths.is_empty() {
            return Ok(());
        }

        // 1. 在執行前，進行最後一道防線：安全閘道驗證
        for path_str in &paths {
            let path = PathBuf::from(path_str);
            // 如果觸犯絕對白名單，直接報錯阻斷，確保系統安全
            safety::check_path_safety(&path)?;
        }

        // 2. 初始化 COM (單線程/多線程 Apartment)
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        let need_uninit = hr.is_ok();

        let result = Self::perform_recycle(paths);

        // 3. 反初始化 COM
        if need_uninit {
            unsafe { CoUninitialize() };
        }

        result
    }

    fn perform_recycle(paths: Vec<String>) -> EngineResult<()> {
        unsafe {
            // 實例化 IFileOperation
            let file_op: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_ALL)
                .map_err(|e| EngineError::Win32Error {
                    operation: "CoCreateInstance(IFileOperation)".to_string(),
                    message: e.to_string(),
                })?;

            // 設定旗標：
            // FOF_ALLOWUNDO: 移至資源回收筒
            // FOF_NOCONFIRMATION: 不彈出「是否確定要刪除」
            // FOF_NOERRORUI: 不顯示錯誤對話框
            // FOF_SILENT: 隱藏進度條
            let flags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT;

            // FOF_ flags are usually FILEOP_FLAGS (u16). Let's cast to FILEOPERATION_FLAGS (u32).
            let op_flags = windows::Win32::UI::Shell::FILEOPERATION_FLAGS(flags.0 as u32);
            file_op
                .SetOperationFlags(op_flags)
                .map_err(|e| EngineError::Win32Error {
                    operation: "IFileOperation::SetOperationFlags".to_string(),
                    message: e.to_string(),
                })?;

            // 針對每一個目標檔案，將其轉換為 IShellItem 並加入刪除佇列
            for path_str in paths {
                // 將含有 Unix 格式 `/` 的路徑，確保轉換回 Windows 的 `\`
                let win_path = path_str.replace("/", "\\");
                let hstring = HSTRING::from(win_path);

                let item_result: windows::core::Result<IShellItem> =
                    SHCreateItemFromParsingName(&hstring, None);

                match item_result {
                    Ok(item) => {
                        // 加入佇列
                        if let Err(e) = file_op.DeleteItem(&item, None) {
                            eprintln!(
                                "Warning: Failed to add item to delete queue: {} - {}",
                                path_str, e
                            );
                        }
                    }
                    Err(e) => {
                        // 若檔案已不存在等情況，記錄並忽略，繼續處理下一個
                        eprintln!(
                            "Warning: Failed to create IShellItem for {}: {}",
                            path_str, e
                        );
                    }
                }
            }

            // 批次執行所有操作
            file_op
                .PerformOperations()
                .map_err(|e| EngineError::Win32Error {
                    operation: "IFileOperation::PerformOperations".to_string(),
                    message: e.to_string(),
                })?;

            Ok(())
        }
    }
}
