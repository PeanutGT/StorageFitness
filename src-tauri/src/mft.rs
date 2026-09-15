// ============================================================================
// 模組：mft.rs — NTFS $MFT 直讀引擎 (Binary Parser & Tree Reconstruction)
// 負責人：🧠 Claude Opus 4.6
// 規範：此模組實作 NTFS Master File Table 的二進位解析，
//       繞過 Win32 File API 直接讀取 Volume Handle，
//       實現數秒內全磁碟百萬級檔案解析。
//
// 安全守則：
//   - unsafe 僅限於 Win32 FFI 呼叫 (CreateFileW, ReadFile, Token 操作)
//   - 所有 Handle 透過 SafeHandle RAII wrapper 自動釋放
//   - 嚴禁 unwrap()/panic!()，一律回傳 EngineError
//   - Reparse Point Record 的子節點遍歷被阻斷
// ============================================================================

use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use crate::errors::{EngineError, EngineResult};
use crate::models::{FileNode, ScanProgressEvent, ScanStatus};
use crate::scanner::DiskScanner;

// ==========================================
// 1. MFT 引擎配置
// ==========================================

/// NTFS $MFT 直讀引擎的專屬配置。
pub struct MftScannerConfig {
    /// 目標磁碟機代號（例如 'C'）
    pub drive_letter: char,
    /// 是否解析 Non-resident Data Runs（完整大小計算需要）
    pub parse_data_runs: bool,
    /// MFT Record 批次讀取數量（影響記憶體使用）
    pub batch_size: usize,
}

impl Default for MftScannerConfig {
    fn default() -> Self {
        Self {
            drive_letter: 'C',
            parse_data_runs: true,
            batch_size: 4096,
        }
    }
}

// ==========================================
// 2. SafeHandle — RAII Win32 Handle Wrapper
// ==========================================

#[cfg(windows)]
mod win32 {
    use crate::errors::{EngineError, EngineResult};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{
        AllocateAndInitializeSid, CheckTokenMembership, FreeSid, PSID, SID_IDENTIFIER_AUTHORITY,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };

    /// RAII wrapper for Win32 HANDLE.
    /// Automatically calls CloseHandle on Drop, preventing resource leaks.
    pub struct SafeHandle(HANDLE);

    impl SafeHandle {
        pub fn new(handle: HANDLE) -> Self {
            Self(handle)
        }

        pub fn raw(&self) -> HANDLE {
            self.0
        }
    }

    impl Drop for SafeHandle {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                // SAFETY: self.0 was obtained from a successful CreateFileW or
                // OpenProcessToken call and is guaranteed to be a valid, open handle
                // at this point (single-owner semantics enforced by SafeHandle).
                let _ = unsafe { CloseHandle(self.0) };
            }
        }
    }

    /// Open a raw NTFS volume handle for direct reading.
    ///
    /// # Arguments
    /// * `drive_letter` - The drive letter (e.g., 'C')
    ///
    /// # Safety Rationale
    /// The unsafe block calls CreateFileW, a Win32 FFI function.
    /// The returned HANDLE is immediately wrapped in SafeHandle for RAII cleanup.
    /// FILE_SHARE_READ | FILE_SHARE_WRITE allows concurrent access by the OS.
    pub fn open_volume(drive_letter: char) -> EngineResult<SafeHandle> {
        let volume_path: Vec<u16> = format!(r"\\.\{}:", drive_letter)
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: CreateFileW is called with:
        //   - A null-terminated UTF-16 volume path (\\.\C:)
        //   - GENERIC_READ access (read-only, no modification)
        //   - FILE_SHARE_READ | FILE_SHARE_WRITE (non-exclusive access)
        //   - OPEN_EXISTING (volume must already exist)
        //   - FILE_FLAG_BACKUP_SEMANTICS (required for volume/directory access)
        // The resulting HANDLE is immediately wrapped in SafeHandle for automatic cleanup.
        let handle = unsafe {
            CreateFileW(
                PCWSTR(volume_path.as_ptr()),
                windows::Win32::Storage::FileSystem::FILE_GENERIC_READ.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                None,
            )
        }
        .map_err(|e| EngineError::Win32Error {
            operation: "CreateFileW (volume)".to_string(),
            message: e.to_string(),
        })?;

        Ok(SafeHandle::new(handle))
    }

    /// Read `count` bytes from the volume handle at the current file pointer position.
    ///
    /// # Safety Rationale
    /// ReadFile is a Win32 FFI function that reads bytes into a pre-allocated buffer.
    /// The buffer is allocated and sized before the call. The bytes_read output
    /// parameter ensures we only process actually-read data.
    pub fn read_volume(handle: &SafeHandle, buffer: &mut [u8]) -> EngineResult<u32> {
        let mut bytes_read: u32 = 0;

        // SAFETY: ReadFile is called with:
        //   - A valid HANDLE obtained from open_volume (wrapped in SafeHandle)
        //   - A mutable buffer slice with known length
        //   - A pointer to bytes_read for actual read count
        //   - No overlapped I/O (synchronous read)
        // The buffer is pre-allocated by the caller and bytes_read is stack-allocated.
        let success = unsafe { ReadFile(handle.raw(), Some(buffer), Some(&mut bytes_read), None) };

        match success {
            Ok(()) => Ok(bytes_read),
            Err(e) => Err(EngineError::Win32Error {
                operation: "ReadFile (volume)".to_string(),
                message: e.to_string(),
            }),
        }
    }

    /// Set the file pointer for the volume handle to an absolute byte offset.
    pub fn seek_volume(handle: &SafeHandle, offset: i64) -> EngineResult<()> {
        use windows::Win32::Storage::FileSystem::{SetFilePointerEx, FILE_BEGIN};

        // SAFETY: SetFilePointerEx is called with a valid HANDLE and a byte offset.
        // FILE_BEGIN means absolute positioning from the start of the volume.
        let result = unsafe { SetFilePointerEx(handle.raw(), offset, None, FILE_BEGIN) };

        match result {
            Ok(()) => Ok(()),
            Err(e) => Err(EngineError::Win32Error {
                operation: "SetFilePointerEx".to_string(),
                message: e.to_string(),
            }),
        }
    }

    /// Check whether the current process has Administrator privileges.
    ///
    /// Uses AllocateAndInitializeSid + CheckTokenMembership to verify membership
    /// in the BUILTIN\Administrators group (S-1-5-32-544).
    pub fn is_elevated() -> EngineResult<bool> {
        let mut admin_group: PSID = PSID::default();
        // SECURITY_NT_AUTHORITY = {0,0,0,0,0,5}
        let nt_authority = SID_IDENTIFIER_AUTHORITY {
            Value: [0, 0, 0, 0, 0, 5],
        };

        // SECURITY_BUILTIN_DOMAIN_RID = 32
        // DOMAIN_ALIAS_RID_ADMINS = 544
        const SECURITY_BUILTIN_DOMAIN_RID: u32 = 32;
        const DOMAIN_ALIAS_RID_ADMINS: u32 = 544;

        // SAFETY: AllocateAndInitializeSid creates a SID for the Administrators group.
        // The SID is freed via FreeSid in the cleanup block below.
        let alloc_result = unsafe {
            AllocateAndInitializeSid(
                &nt_authority,
                2,
                SECURITY_BUILTIN_DOMAIN_RID,
                DOMAIN_ALIAS_RID_ADMINS,
                0,
                0,
                0,
                0,
                0,
                0,
                &mut admin_group,
            )
        };

        if let Err(e) = alloc_result {
            return Err(EngineError::Win32Error {
                operation: "AllocateAndInitializeSid".to_string(),
                message: e.to_string(),
            });
        }

        let mut is_member = windows::core::BOOL::default();

        // SAFETY: CheckTokenMembership checks the current process token against
        // the Administrators SID. We pass None for the token handle to use the
        // current effective token. admin_group is a valid SID from AllocateAndInitializeSid.
        let check_result = unsafe { CheckTokenMembership(None, admin_group, &mut is_member) };

        // SAFETY: FreeSid releases the SID allocated by AllocateAndInitializeSid.
        // This is called regardless of CheckTokenMembership success/failure.
        unsafe {
            let _ = FreeSid(admin_group);
        }

        match check_result {
            Ok(()) => Ok(is_member.as_bool()),
            Err(e) => Err(EngineError::Win32Error {
                operation: "CheckTokenMembership".to_string(),
                message: e.to_string(),
            }),
        }
    }
}

// ==========================================
// 3. NTFS 結構定義與二進位解析
// ==========================================

/// NTFS Boot Sector 中我們需要的關鍵欄位。
/// Boot Sector 位於 Volume 的前 512 bytes。
#[derive(Debug, Clone)]
struct NtfsBootSector {
    /// 每個 Sector 的位元組數（通常為 512）
    bytes_per_sector: u16,
    /// 每個 Cluster 包含的 Sector 數（通常為 8）
    sectors_per_cluster: u8,
    /// $MFT 的起始 Logical Cluster Number
    mft_cluster_number: u64,
    /// 單個 MFT Record 的大小（位元組）
    mft_record_size: u32,
}

impl NtfsBootSector {
    /// 從 Boot Sector 的原始位元組中解析關鍵欄位。
    ///
    /// NTFS Boot Sector layout (selected offsets):
    ///   0x0B-0x0C: bytes per sector (u16 LE)
    ///   0x0D:      sectors per cluster (u8)
    ///   0x30-0x37: MFT logical cluster number (u64 LE)
    ///   0x40:      clusters per MFT record (i8, signed)
    fn parse(buffer: &[u8]) -> EngineResult<Self> {
        if buffer.len() < 512 {
            return Err(EngineError::MftParseError(
                "Boot sector buffer too small (need 512 bytes)".to_string(),
            ));
        }

        // Validate NTFS OEM ID at offset 0x03
        let oem_id = &buffer[0x03..0x0B];
        if oem_id != b"NTFS    " {
            return Err(EngineError::MftParseError(format!(
                "Not an NTFS volume (OEM ID: {:?})",
                std::str::from_utf8(oem_id).unwrap_or("<invalid>")
            )));
        }

        let bytes_per_sector = u16::from_le_bytes([buffer[0x0B], buffer[0x0C]]);
        let sectors_per_cluster = buffer[0x0D];
        let mft_cluster_number = u64::from_le_bytes([
            buffer[0x30],
            buffer[0x31],
            buffer[0x32],
            buffer[0x33],
            buffer[0x34],
            buffer[0x35],
            buffer[0x36],
            buffer[0x37],
        ]);

        // MFT Record size: byte at 0x40 is signed.
        // If positive: clusters per record. If negative: 2^|value| bytes per record.
        let clusters_per_record = buffer[0x40] as i8;
        let mft_record_size = if clusters_per_record > 0 {
            (clusters_per_record as u32) * (sectors_per_cluster as u32) * (bytes_per_sector as u32)
        } else {
            // Negative value means 2^|value| bytes
            1u32 << (clusters_per_record.unsigned_abs())
        };

        Ok(Self {
            bytes_per_sector,
            sectors_per_cluster,
            mft_cluster_number,
            mft_record_size,
        })
    }

    /// 計算 $MFT 在磁碟上的絕對位元組偏移量。
    fn mft_byte_offset(&self) -> u64 {
        self.mft_cluster_number * (self.sectors_per_cluster as u64) * (self.bytes_per_sector as u64)
    }
}

/// 從 MFT Record 解析出的中間結構。
/// 扁平表示，尚未建構成樹狀。
#[derive(Debug, Clone)]
struct MftRecord {
    /// 此 Record 的 MFT Reference Number
    record_number: u64,
    /// 父目錄的 MFT Reference Number
    parent_record_number: u64,
    /// 檔案或目錄名稱
    file_name: String,
    /// 檔案大小（位元組），目錄為 0
    file_size: u64,
    /// 是否為目錄
    is_directory: bool,
    /// 是否為 Reparse Point (Symlink / Junction)
    is_reparse_point: bool,
    /// 此 Record 是否仍在使用中（未被刪除）
    /// 用於 parse 階段過濾，之後不再讀取
    #[allow(dead_code)]
    is_in_use: bool,
}

// MFT Attribute type constants
const ATTR_TYPE_FILE_NAME: u32 = 0x30;
const ATTR_TYPE_DATA: u32 = 0x80;
const ATTR_TYPE_REPARSE_POINT: u32 = 0xC0;
const ATTR_TYPE_END: u32 = 0xFFFFFFFF;

// MFT Record flags
const FILE_RECORD_IN_USE: u16 = 0x0001;
const FILE_RECORD_IS_DIRECTORY: u16 = 0x0002;

// FILE_NAME namespace constants
const FILE_NAME_NAMESPACE_DOS: u8 = 2;

/// 解析單個 MFT File Record Segment。
///
/// 每個 Record 通常為 1024 bytes，結構：
///   0x00-0x03: Signature "FILE"
///   0x04-0x05: Offset to Update Sequence
///   0x06-0x07: Size in words of Update Sequence
///   0x14-0x15: Offset to first attribute
///   0x16-0x17: Flags (IN_USE, IS_DIRECTORY)
///   0x2C-0x2F: Record number (in some NTFS versions)
///   Attributes follow at the first attribute offset.
fn parse_mft_record(buffer: &[u8], record_size: u32, record_index: u64) -> Option<MftRecord> {
    if buffer.len() < record_size as usize {
        return None;
    }

    // Validate FILE signature (0x46494C45)
    if buffer.len() < 4 || &buffer[0..4] != b"FILE" {
        return None;
    }

    // Apply fixup array to correct sector-boundary bytes
    let mut fixed_buffer = buffer[..record_size as usize].to_vec();
    if !apply_fixup_array(&mut fixed_buffer, record_size) {
        return None;
    }

    // Parse flags
    let flags = u16::from_le_bytes([fixed_buffer[0x16], fixed_buffer[0x17]]);
    let is_in_use = flags & FILE_RECORD_IN_USE != 0;
    let is_directory = flags & FILE_RECORD_IS_DIRECTORY != 0;

    // Skip records that are not in use (deleted files)
    if !is_in_use {
        return None;
    }

    // Get offset to first attribute
    let first_attr_offset = u16::from_le_bytes([fixed_buffer[0x14], fixed_buffer[0x15]]) as usize;

    // Walk attribute list
    let mut file_name: Option<String> = None;
    let mut parent_record_number: u64 = 0;
    let mut file_size: u64 = 0;
    let mut is_reparse_point = false;
    let mut best_namespace: Option<u8> = None;

    let mut offset = first_attr_offset;
    loop {
        if offset + 4 > fixed_buffer.len() {
            break;
        }

        let attr_type = u32::from_le_bytes([
            fixed_buffer[offset],
            fixed_buffer[offset + 1],
            fixed_buffer[offset + 2],
            fixed_buffer[offset + 3],
        ]);

        if attr_type == ATTR_TYPE_END || attr_type == 0 {
            break;
        }

        if offset + 8 > fixed_buffer.len() {
            break;
        }

        let attr_length = u32::from_le_bytes([
            fixed_buffer[offset + 4],
            fixed_buffer[offset + 5],
            fixed_buffer[offset + 6],
            fixed_buffer[offset + 7],
        ]) as usize;

        if attr_length == 0 || offset + attr_length > fixed_buffer.len() {
            break;
        }

        match attr_type {
            ATTR_TYPE_FILE_NAME => {
                // $FILE_NAME is always resident. Parse it.
                if let Some((name, parent, namespace)) =
                    parse_file_name_attr(&fixed_buffer[offset..offset + attr_length])
                {
                    // Prefer Win32 (0) or Win32+DOS (3) names over pure DOS (2) names
                    let dominated = match best_namespace {
                        Some(existing) => {
                            namespace == FILE_NAME_NAMESPACE_DOS
                                && existing != FILE_NAME_NAMESPACE_DOS
                        }
                        None => false,
                    };
                    if !dominated {
                        file_name = Some(name);
                        parent_record_number = parent;
                        best_namespace = Some(namespace);
                    }
                }
            }
            ATTR_TYPE_DATA => {
                // $DATA attribute — get real file size
                if offset + 16 <= fixed_buffer.len() {
                    let non_resident_flag = fixed_buffer[offset + 8];
                    if non_resident_flag == 0 {
                        // Resident: content length at offset 0x10
                        if offset + 0x14 <= fixed_buffer.len() {
                            file_size = u32::from_le_bytes([
                                fixed_buffer[offset + 0x10],
                                fixed_buffer[offset + 0x11],
                                fixed_buffer[offset + 0x12],
                                fixed_buffer[offset + 0x13],
                            ]) as u64;
                        }
                    } else {
                        // Non-resident: real_size at offset 0x30
                        if offset + 0x38 <= fixed_buffer.len() {
                            file_size = u64::from_le_bytes([
                                fixed_buffer[offset + 0x30],
                                fixed_buffer[offset + 0x31],
                                fixed_buffer[offset + 0x32],
                                fixed_buffer[offset + 0x33],
                                fixed_buffer[offset + 0x34],
                                fixed_buffer[offset + 0x35],
                                fixed_buffer[offset + 0x36],
                                fixed_buffer[offset + 0x37],
                            ]);
                        }
                    }
                }
            }
            ATTR_TYPE_REPARSE_POINT => {
                is_reparse_point = true;
            }
            _ => {
                // Skip unknown attribute types
            }
        }

        offset += attr_length;
    }

    // Must have at least a file name to be useful
    let name = file_name?;

    Some(MftRecord {
        record_number: record_index,
        parent_record_number,
        file_name: name,
        file_size,
        is_directory,
        is_reparse_point,
        is_in_use,
    })
}

/// Parse a $FILE_NAME attribute (type 0x30).
/// Returns (filename, parent_mft_reference, namespace).
///
/// $FILE_NAME attribute layout (resident, content at offset 0x18 from attr start):
///   +0x00-0x05: Parent directory MFT reference (6 bytes, LE)
///   +0x40:      Filename length in characters (u8)
///   +0x41:      Filename namespace (u8): 0=Win32, 1=POSIX, 2=DOS, 3=Win32+DOS
///   +0x42...:   Filename (UTF-16LE)
fn parse_file_name_attr(attr_buffer: &[u8]) -> Option<(String, u64, u8)> {
    if attr_buffer.len() < 0x18 + 0x44 {
        return None;
    }

    // Resident attribute: content offset is at attr+0x14 (u16 LE)
    let content_offset = u16::from_le_bytes([attr_buffer[0x14], attr_buffer[0x15]]) as usize;

    if content_offset + 0x42 > attr_buffer.len() {
        return None;
    }

    let content = &attr_buffer[content_offset..];
    if content.len() < 0x44 {
        return None;
    }

    // Parent directory MFT reference (first 6 bytes of 8-byte reference)
    let parent_ref = u64::from_le_bytes([
        content[0], content[1], content[2], content[3], content[4], content[5], 0, 0,
    ]) & 0x0000_FFFF_FFFF_FFFF; // Mask to 48-bit record number

    let name_length = content[0x40] as usize;
    let namespace = content[0x41];

    if content.len() < 0x42 + name_length * 2 {
        return None;
    }

    // Decode UTF-16LE filename
    let name_bytes = &content[0x42..0x42 + name_length * 2];
    let utf16_chars: Vec<u16> = name_bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();

    let file_name = String::from_utf16_lossy(&utf16_chars);

    Some((file_name, parent_ref, namespace))
}

/// Apply the NTFS fixup array to correct multi-sector records.
///
/// MFT Records that span multiple sectors have a "fixup array"
/// (also called Update Sequence Array) that replaces the last 2 bytes
/// of each sector. This function restores the original bytes.
///
/// Layout at record start:
///   offset 0x04: offset to update sequence (u16 LE)
///   offset 0x06: size of update sequence in words (u16 LE)
///   The first word is the expected signature; subsequent words are
///   the original bytes replaced at each sector boundary.
fn apply_fixup_array(buffer: &mut [u8], record_size: u32) -> bool {
    if buffer.len() < 8 {
        return false;
    }

    let fixup_offset = u16::from_le_bytes([buffer[0x04], buffer[0x05]]) as usize;
    let fixup_count = u16::from_le_bytes([buffer[0x06], buffer[0x07]]) as usize;

    // fixup_count includes the signature word, so actual entries = count - 1
    if fixup_count < 2 {
        return true; // No fixups needed
    }

    if fixup_offset + fixup_count * 2 > buffer.len() {
        return false;
    }

    // Read the expected signature (first word of fixup array)
    let signature = u16::from_le_bytes([buffer[fixup_offset], buffer[fixup_offset + 1]]);

    let sector_size: usize = 512; // Standard NTFS sector size

    for i in 1..fixup_count {
        let sector_end = i * sector_size;
        if sector_end > record_size as usize || sector_end < 2 {
            break;
        }

        let check_offset = sector_end - 2;
        let fixup_value_offset = fixup_offset + i * 2;

        if check_offset + 2 > buffer.len() || fixup_value_offset + 2 > buffer.len() {
            break;
        }

        // Verify the signature at the sector boundary
        let found = u16::from_le_bytes([buffer[check_offset], buffer[check_offset + 1]]);
        if found != signature {
            return false; // Fixup validation failed — corrupt record
        }

        // Replace with original bytes from the fixup array
        buffer[check_offset] = buffer[fixup_value_offset];
        buffer[check_offset + 1] = buffer[fixup_value_offset + 1];
    }

    true
}

// ==========================================
// 4. MFT Scanner — 主引擎結構體
// ==========================================

/// NTFS $MFT 直讀掃描引擎。
///
/// 直接讀取 NTFS 磁區的 $MFT (Master File Table)，
/// 繞過 Win32 File API 的逐檔案查詢開銷，實現數秒內全磁碟解析。
///
/// # 權限需求
/// 必須以管理員權限運行（需 UAC 提權），因為直接開啟 Volume Handle
/// 需要 `GENERIC_READ` on `\\.\C:`。
pub struct MftScanner {
    config: MftScannerConfig,
}

impl MftScanner {
    /// 建立新的 MFT 掃描器實例。
    pub fn new(config: MftScannerConfig) -> Self {
        Self { config }
    }

    /// 檢查當前進程是否具有管理員權限。
    #[cfg(windows)]
    pub fn check_admin_privilege() -> EngineResult<bool> {
        win32::is_elevated()
    }

    #[cfg(not(windows))]
    pub fn check_admin_privilege() -> EngineResult<bool> {
        Ok(false)
    }

    /// 執行完整的 MFT 掃描管線。
    /// 1. 開啟 Volume Handle
    /// 2. 讀取 Boot Sector → 取得 MFT 位置
    /// 3. 讀取所有 MFT Records → 批次解析
    /// 4. 重建 FileNode 樹狀結構
    #[cfg(windows)]
    fn execute_mft_scan(
        &self,
        progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        let start_time = Instant::now();
        let drive_letter = self.config.drive_letter;

        // Step 1: Open Volume
        progress_callback(ScanProgressEvent {
            status: ScanStatus::Initializing,
            files_scanned: 0,
            directories_scanned: 0,
            current_path: format!(r"\\.\{}:", drive_letter),
            elapsed_ms: 0,
            error_message: None,
        });

        let handle = win32::open_volume(drive_letter)?;

        // Step 2: Read Boot Sector
        let mut boot_sector_buf = vec![0u8; 512];
        let bytes_read = win32::read_volume(&handle, &mut boot_sector_buf)?;
        if bytes_read < 512 {
            return Err(EngineError::MftParseError(
                "Failed to read complete boot sector".to_string(),
            ));
        }

        let boot_sector = NtfsBootSector::parse(&boot_sector_buf)?;
        let mft_offset = boot_sector.mft_byte_offset();
        let record_size = boot_sector.mft_record_size;

        progress_callback(ScanProgressEvent {
            status: ScanStatus::MftParsing,
            files_scanned: 0,
            directories_scanned: 0,
            current_path: format!(
                "MFT at offset 0x{:X}, record size: {} bytes",
                mft_offset, record_size
            ),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            error_message: None,
        });

        // Step 3: Seek to MFT start and read records in batches
        win32::seek_volume(&handle, mft_offset as i64)?;

        let batch_size = self.config.batch_size;
        let batch_buf_size = record_size as usize * batch_size;
        let mut batch_buffer = vec![0u8; batch_buf_size];
        let mut all_records: Vec<MftRecord> = Vec::with_capacity(500_000);
        let mut record_index: u64 = 0;
        let mut total_parsed: u64 = 0;

        loop {
            let bytes_read = win32::read_volume(&handle, &mut batch_buffer)?;
            if bytes_read == 0 {
                break;
            }

            let records_in_batch = bytes_read as usize / record_size as usize;
            if records_in_batch == 0 {
                break;
            }

            for i in 0..records_in_batch {
                let start = i * record_size as usize;
                let end = start + record_size as usize;
                if end > bytes_read as usize {
                    break;
                }

                if let Some(record) =
                    parse_mft_record(&batch_buffer[start..end], record_size, record_index)
                {
                    all_records.push(record);
                    total_parsed += 1;
                }

                record_index += 1;
            }

            // Send progress every batch
            if record_index % (batch_size as u64 * 4) == 0 {
                progress_callback(ScanProgressEvent {
                    status: ScanStatus::MftParsing,
                    files_scanned: total_parsed,
                    directories_scanned: 0,
                    current_path: format!("Parsed {} MFT records...", record_index),
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                    error_message: None,
                });
            }

            // If we read fewer bytes than a full batch, we've reached the end of the MFT
            if (bytes_read as usize) < batch_buf_size {
                break;
            }
        }

        progress_callback(ScanProgressEvent {
            status: ScanStatus::BuildingTree,
            files_scanned: total_parsed,
            directories_scanned: 0,
            current_path: format!(
                "Building tree from {} active records (out of {} total)",
                all_records.len(),
                record_index
            ),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            error_message: None,
        });

        // Step 4: Build tree
        let tree = build_tree_from_records(all_records, drive_letter);

        progress_callback(ScanProgressEvent {
            status: ScanStatus::Completed,
            files_scanned: total_parsed,
            directories_scanned: 0,
            current_path: format!("{}:\\", drive_letter),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            error_message: None,
        });

        Ok(tree)
    }

    #[cfg(not(windows))]
    fn execute_mft_scan(
        &self,
        _progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        Err(EngineError::MftParseError(
            "MFT direct read is only supported on Windows".to_string(),
        ))
    }
}

// ==========================================
// 5. 樹狀結構重建
// ==========================================

/// 將扁平的 MFT Records 重建為 FileNode 樹狀結構。
///
/// 演算法：
/// 1. 建立 parent→children 的 HashMap
/// 2. 從 MFT Record #5（NTFS 根目錄）開始 DFS
/// 3. Reparse Point 的 children 設為 None（阻斷遍歷）
/// 4. 目錄大小為其所有子節點大小的加總
fn build_tree_from_records(records: Vec<MftRecord>, drive_letter: char) -> FileNode {
    // Build parent → children index
    let mut children_map: HashMap<u64, Vec<MftRecord>> = HashMap::new();
    for record in records {
        children_map
            .entry(record.parent_record_number)
            .or_default()
            .push(record);
    }

    // Root directory is MFT record #5
    let root_path = format!("{}:\\", drive_letter);
    build_node_recursive(5, &root_path, &children_map, 0)
}

fn build_node_recursive(
    record_number: u64,
    path: &str,
    children_map: &HashMap<u64, Vec<MftRecord>>,
    depth: u32,
) -> FileNode {
    let children_records = children_map.get(&record_number);

    let mut child_nodes: Vec<FileNode> = Vec::new();
    let mut total_size: u64 = 0;

    if let Some(records) = children_records {
        for record in records {
            // Skip self-referencing records (record 5 has parent 5 for ".")
            if record.record_number == record_number {
                continue;
            }

            let child_path = if path.ends_with('\\') {
                format!("{}{}", path, record.file_name)
            } else {
                format!("{}\\{}", path, record.file_name)
            };

            if record.is_directory {
                if record.is_reparse_point {
                    // Reparse Point directory: record but do NOT recurse
                    child_nodes.push(FileNode {
                        id: format!("mft-{}", record.record_number),
                        name: record.file_name.clone(),
                        path: child_path,
                        size_bytes: 0,
                        is_directory: true,
                        is_reparse_point: true,
                        extension: None,
                        depth: depth + 1,
                        children: None, // Critical: blocks traversal
                    });
                } else {
                    // Normal directory: recurse
                    let child_node = build_node_recursive(
                        record.record_number,
                        &child_path,
                        children_map,
                        depth + 1,
                    );
                    total_size += child_node.size_bytes;
                    child_nodes.push(child_node);
                }
            } else {
                // File node
                total_size += record.file_size;
                let extension = std::path::Path::new(&record.file_name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase());

                child_nodes.push(FileNode {
                    id: format!("mft-{}", record.record_number),
                    name: record.file_name.clone(),
                    path: child_path,
                    size_bytes: record.file_size,
                    is_directory: false,
                    is_reparse_point: record.is_reparse_point,
                    extension,
                    depth: depth + 1,
                    children: None,
                });
            }
        }
    }

    // Sort children by size descending (consistent with StandardScanner)
    child_nodes.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    // Determine name for this node
    let name = if record_number == 5 {
        format!("{}:\\", drive_letter(path))
    } else {
        std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    };

    FileNode {
        id: format!("mft-{}", record_number),
        name,
        path: path.to_string(),
        size_bytes: total_size,
        is_directory: true,
        is_reparse_point: false,
        extension: None,
        depth,
        children: Some(child_nodes),
    }
}

/// Extract drive letter from a path like "C:\..."
fn drive_letter(path: &str) -> char {
    path.chars().next().unwrap_or('C')
}

// ==========================================
// 6. DiskScanner trait 實作
// ==========================================

impl DiskScanner for MftScanner {
    fn scan(
        &self,
        _root: &Path,
        progress_callback: &dyn Fn(ScanProgressEvent),
    ) -> EngineResult<FileNode> {
        // Step 1: Check admin privilege
        let has_admin = Self::check_admin_privilege()?;
        if !has_admin {
            return Err(EngineError::InsufficientPrivilege(
                "MFT direct read requires administrator privileges. \
                 Please re-launch with UAC elevation or use the standard scanner."
                    .to_string(),
            ));
        }

        // Step 2: Execute the full MFT scan pipeline
        self.execute_mft_scan(progress_callback)
    }
}

// ==========================================
// 7. 單元測試
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a minimal valid NTFS boot sector for testing.
    fn make_test_boot_sector() -> Vec<u8> {
        let mut buf = vec![0u8; 512];
        // OEM ID at 0x03
        buf[0x03..0x0B].copy_from_slice(b"NTFS    ");
        // bytes_per_sector = 512 (0x0200)
        buf[0x0B] = 0x00;
        buf[0x0C] = 0x02;
        // sectors_per_cluster = 8
        buf[0x0D] = 8;
        // MFT cluster number = 786432 (0x0C0000)
        let mft_lcn: u64 = 786432;
        buf[0x30..0x38].copy_from_slice(&mft_lcn.to_le_bytes());
        // clusters_per_record: -10 means 2^10 = 1024 bytes
        buf[0x40] = (-10i8) as u8;
        buf
    }

    /// Create a minimal MFT FILE record for testing.
    fn make_test_file_record(
        _record_number: u64,
        parent: u64,
        name: &str,
        size: u64,
        is_dir: bool,
        is_reparse: bool,
    ) -> Vec<u8> {
        let mut buf = vec![0u8; 1024];

        // Signature "FILE"
        buf[0..4].copy_from_slice(b"FILE");

        // Fixup offset (0x30) and count (3 for a 1024-byte record with 512-byte sectors)
        buf[0x04] = 0x30;
        buf[0x05] = 0x00;
        buf[0x06] = 0x03;
        buf[0x07] = 0x00;

        // Write fixup array at offset 0x30
        // Signature word
        buf[0x30] = 0x01;
        buf[0x31] = 0x00;
        // Fixup entry 1 (for sector 1 boundary at byte 510-511)
        buf[0x32] = 0x00;
        buf[0x33] = 0x00;
        // Fixup entry 2 (for sector 2 boundary at byte 1022-1023)
        buf[0x34] = 0x00;
        buf[0x35] = 0x00;

        // Put the signature at sector boundaries
        buf[510] = 0x01;
        buf[511] = 0x00;
        buf[1022] = 0x01;
        buf[1023] = 0x00;

        // First attribute offset: 0x38 (after fixup array)
        buf[0x14] = 0x38;
        buf[0x15] = 0x00;

        // Flags
        let mut flags: u16 = FILE_RECORD_IN_USE;
        if is_dir {
            flags |= FILE_RECORD_IS_DIRECTORY;
        }
        buf[0x16..0x18].copy_from_slice(&flags.to_le_bytes());

        // Now build attributes starting at offset 0x38
        let mut attr_offset: usize = 0x38;

        // === $FILE_NAME attribute (type 0x30) ===
        let name_utf16: Vec<u16> = name.encode_utf16().collect();
        let name_bytes_len = name_utf16.len() * 2;
        let fn_content_size = 0x42 + name_bytes_len;
        let fn_content_offset: u16 = 0x18; // Standard resident content offset
        let fn_attr_size = fn_content_offset as usize + fn_content_size;
        // Align to 8 bytes
        let fn_attr_size_aligned = (fn_attr_size + 7) & !7;

        // Attribute header
        buf[attr_offset..attr_offset + 4].copy_from_slice(&ATTR_TYPE_FILE_NAME.to_le_bytes());
        buf[attr_offset + 4..attr_offset + 8]
            .copy_from_slice(&(fn_attr_size_aligned as u32).to_le_bytes());
        buf[attr_offset + 8] = 0; // Resident
        buf[attr_offset + 0x14..attr_offset + 0x16]
            .copy_from_slice(&fn_content_offset.to_le_bytes());

        // $FILE_NAME content
        let content_start = attr_offset + fn_content_offset as usize;
        // Parent reference (6 bytes)
        let parent_bytes = parent.to_le_bytes();
        buf[content_start..content_start + 6].copy_from_slice(&parent_bytes[..6]);
        // Name length
        buf[content_start + 0x40] = name_utf16.len() as u8;
        // Namespace: Win32+DOS (3)
        buf[content_start + 0x41] = 3;
        // Name (UTF-16LE)
        for (i, &ch) in name_utf16.iter().enumerate() {
            let ch_bytes = ch.to_le_bytes();
            buf[content_start + 0x42 + i * 2] = ch_bytes[0];
            buf[content_start + 0x42 + i * 2 + 1] = ch_bytes[1];
        }

        attr_offset += fn_attr_size_aligned;

        // === $DATA attribute (type 0x80, resident) ===
        if !is_dir && size > 0 {
            let data_attr_size: usize = 0x18; // Minimal resident $DATA header
            let data_attr_aligned = (data_attr_size + 7) & !7;

            buf[attr_offset..attr_offset + 4].copy_from_slice(&ATTR_TYPE_DATA.to_le_bytes());
            buf[attr_offset + 4..attr_offset + 8]
                .copy_from_slice(&(data_attr_aligned as u32).to_le_bytes());
            buf[attr_offset + 8] = 0; // Resident
                                      // Content size at 0x10
            buf[attr_offset + 0x10..attr_offset + 0x14]
                .copy_from_slice(&(size as u32).to_le_bytes());

            attr_offset += data_attr_aligned;
        }

        // === $REPARSE_POINT attribute (type 0xC0) ===
        if is_reparse {
            let rp_attr_size: usize = 0x18;
            let rp_attr_aligned = (rp_attr_size + 7) & !7;

            buf[attr_offset..attr_offset + 4]
                .copy_from_slice(&ATTR_TYPE_REPARSE_POINT.to_le_bytes());
            buf[attr_offset + 4..attr_offset + 8]
                .copy_from_slice(&(rp_attr_aligned as u32).to_le_bytes());

            attr_offset += rp_attr_aligned;
        }

        // End-of-attributes marker
        if attr_offset + 4 <= buf.len() {
            buf[attr_offset..attr_offset + 4].copy_from_slice(&ATTR_TYPE_END.to_le_bytes());
        }

        buf
    }

    #[test]
    fn test_parse_boot_sector() {
        let buf = make_test_boot_sector();
        let bs = NtfsBootSector::parse(&buf).expect("should parse boot sector");
        assert_eq!(bs.bytes_per_sector, 512);
        assert_eq!(bs.sectors_per_cluster, 8);
        assert_eq!(bs.mft_cluster_number, 786432);
        assert_eq!(bs.mft_record_size, 1024);
        assert_eq!(bs.mft_byte_offset(), 786432 * 8 * 512);
    }

    #[test]
    fn test_parse_boot_sector_rejects_non_ntfs() {
        let mut buf = vec![0u8; 512];
        buf[0x03..0x0B].copy_from_slice(b"FAT32   ");
        let result = NtfsBootSector::parse(&buf);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_mft_record_file() {
        let buf = make_test_file_record(100, 5, "readme.txt", 4096, false, false);
        let record = parse_mft_record(&buf, 1024, 100).expect("should parse file record");
        assert_eq!(record.file_name, "readme.txt");
        assert_eq!(record.parent_record_number, 5);
        assert_eq!(record.file_size, 4096);
        assert!(!record.is_directory);
        assert!(!record.is_reparse_point);
        assert!(record.is_in_use);
    }

    #[test]
    fn test_parse_mft_record_directory() {
        let buf = make_test_file_record(200, 5, "Documents", 0, true, false);
        let record = parse_mft_record(&buf, 1024, 200).expect("should parse dir record");
        assert_eq!(record.file_name, "Documents");
        assert!(record.is_directory);
        assert!(!record.is_reparse_point);
    }

    #[test]
    fn test_parse_mft_record_reparse_point() {
        let buf = make_test_file_record(300, 5, "AppData", 0, true, true);
        let record = parse_mft_record(&buf, 1024, 300).expect("should parse reparse record");
        assert!(record.is_reparse_point);
        assert!(record.is_directory);
    }

    #[test]
    fn test_deleted_records_are_filtered() {
        let mut buf = make_test_file_record(400, 5, "deleted.tmp", 100, false, false);
        // Clear the IN_USE flag
        buf[0x16] = 0x00;
        buf[0x17] = 0x00;
        let record = parse_mft_record(&buf, 1024, 400);
        assert!(record.is_none(), "Deleted records should be filtered out");
    }

    #[test]
    fn test_fixup_array_correction() {
        let mut buf = vec![0u8; 1024];
        buf[0..4].copy_from_slice(b"FILE");

        // Fixup at offset 0x04, count=3 (signature + 2 sectors)
        buf[0x04] = 0x30;
        buf[0x06] = 0x03;

        // Signature word = 0xBEEF
        buf[0x30] = 0xEF;
        buf[0x31] = 0xBE;
        // Original value for sector 1 end
        buf[0x32] = 0xAA;
        buf[0x33] = 0xBB;
        // Original value for sector 2 end
        buf[0x34] = 0xCC;
        buf[0x35] = 0xDD;

        // Place signature at sector boundaries
        buf[510] = 0xEF;
        buf[511] = 0xBE;
        buf[1022] = 0xEF;
        buf[1023] = 0xBE;

        assert!(apply_fixup_array(&mut buf, 1024));
        assert_eq!(buf[510], 0xAA);
        assert_eq!(buf[511], 0xBB);
        assert_eq!(buf[1022], 0xCC);
        assert_eq!(buf[1023], 0xDD);
    }

    #[test]
    fn test_fixup_validation_fails_on_mismatch() {
        let mut buf = vec![0u8; 1024];
        buf[0..4].copy_from_slice(b"FILE");

        buf[0x04] = 0x30;
        buf[0x06] = 0x03;

        // Signature = 0x0001
        buf[0x30] = 0x01;
        buf[0x31] = 0x00;
        buf[0x32] = 0xAA;
        buf[0x33] = 0xBB;

        // Wrong signature at sector boundary
        buf[510] = 0xFF;
        buf[511] = 0xFF;

        assert!(!apply_fixup_array(&mut buf, 1024));
    }

    #[test]
    fn test_build_tree_from_flat_records() {
        let records = vec![
            MftRecord {
                record_number: 100,
                parent_record_number: 5,
                file_name: "Users".to_string(),
                file_size: 0,
                is_directory: true,
                is_reparse_point: false,
                is_in_use: true,
            },
            MftRecord {
                record_number: 200,
                parent_record_number: 100,
                file_name: "document.pdf".to_string(),
                file_size: 5_000_000,
                is_directory: false,
                is_reparse_point: false,
                is_in_use: true,
            },
            MftRecord {
                record_number: 300,
                parent_record_number: 100,
                file_name: "photo.jpg".to_string(),
                file_size: 3_000_000,
                is_directory: false,
                is_reparse_point: false,
                is_in_use: true,
            },
        ];

        let tree = build_tree_from_records(records, 'C');
        assert_eq!(tree.name, "C:\\");
        assert!(tree.is_directory);

        let children = tree.children.as_ref().expect("root should have children");
        assert_eq!(children.len(), 1); // Only "Users"
        assert_eq!(children[0].name, "Users");
        assert_eq!(children[0].size_bytes, 8_000_000);

        let users_children = children[0]
            .children
            .as_ref()
            .expect("Users should have children");
        assert_eq!(users_children.len(), 2);
        // Sorted by size descending
        assert_eq!(users_children[0].name, "document.pdf");
        assert_eq!(users_children[1].name, "photo.jpg");
    }

    #[test]
    fn test_reparse_point_blocks_children() {
        let records = vec![
            MftRecord {
                record_number: 100,
                parent_record_number: 5,
                file_name: "junction_dir".to_string(),
                file_size: 0,
                is_directory: true,
                is_reparse_point: true,
                is_in_use: true,
            },
            MftRecord {
                record_number: 200,
                parent_record_number: 100,
                file_name: "hidden_file.txt".to_string(),
                file_size: 1000,
                is_directory: false,
                is_reparse_point: false,
                is_in_use: true,
            },
        ];

        let tree = build_tree_from_records(records, 'C');
        let children = tree.children.as_ref().expect("root should have children");
        assert_eq!(children.len(), 1);

        let junction = &children[0];
        assert_eq!(junction.name, "junction_dir");
        assert!(junction.is_reparse_point);
        assert!(
            junction.children.is_none(),
            "Reparse point must have no children"
        );
    }

    #[test]
    fn test_mft_config_default_values() {
        let config = MftScannerConfig::default();
        assert_eq!(config.drive_letter, 'C');
        assert!(config.parse_data_runs);
        assert_eq!(config.batch_size, 4096);
    }
}
