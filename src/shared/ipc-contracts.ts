/**
 * 專案名稱：Next-Gen Windows Disk Analyzer & Smart Cleaner
 * 負責人：👁️ Gemini 3.1 Pro (架構師)
 * 模組：核心跨進程通訊協定 (IPC Contracts & Data Models)
 * 說明：此檔案定義了 Rust 後端與 Tauri 前端之間的所有資料交換格式。
 * ⚠️ 嚴格規範：任何欄位增刪皆需經由 Gemini 3.1 Pro 審核，嚴禁 Claude 或 Flash 擅自修改。
 */

// ==========================================
// 1. 核心檔案系統節點模型 (用於 Treemap 渲染)
// ==========================================

export interface MftRecordSummary {
  /** 節點唯一識別碼 (通常為檔案路徑 Hash 或 MFT 參考號) */
  id: string;
  /** 節點名稱 (檔案或資料夾名稱) */
  name: string;
  /** 節點絕對路徑 */
  path: string;
  /** 實際佔用磁碟空間大小 (Bytes) */
  sizeBytes: number;
  /** 是否為資料夾 */
  isDirectory: boolean;
  /** 是否為 Reparse Point (Symlink / Junction) - 若為 true，sizeBytes 僅計自身大小，不遍歷 */
  isReparsePoint: boolean;
  /** 檔案擴展名 (若是檔案) */
  extension?: string;
  /** 資料夾層級深度 */
  depth: number;
  /** 子節點清單 (若為資料夾) */
  children?: MftRecordSummary[];
}

// ==========================================
// 2. 掃描進度事件模型 (Streaming Event)
// ==========================================

export type ScanStatus = 'INITIALIZING' | 'MFT_PARSING' | 'WALKING_DIR' | 'BUILDING_TREE' | 'COMPLETED' | 'ERROR';

export interface ScanProgressEvent {
  status: ScanStatus;
  /** 已掃描的檔案總數 */
  filesScanned: number;
  /** 已掃描的資料夾總數 */
  directoriesScanned: number;
  /** 當前正在掃描的磁碟或目錄 */
  currentPath: string;
  /** 耗時 (毫秒) */
  elapsedMs: number;
  /** 錯誤訊息 (若有) */
  errorMessage?: string;
}

// ==========================================
// 3. 智慧清理規則模型 (Rules Engine)
// ==========================================

export type CleanupRiskLevel = 'SAFE' | 'QUARANTINE' | 'SYSTEM_RESTORE_REQUIRED';

export interface CleanupRule {
  /** 規則 ID (例如: 'dev-node-modules') */
  ruleId: string;
  /** 規則名稱 (例如: 'Node.js 依賴套件') */
  name: string;
  /** 規則描述 */
  description: string;
  /** 目標路徑映射或正規表達式 (例如: '**\/node_modules') */
  targetPattern: string;
  /** 風險等級 */
  riskLevel: CleanupRiskLevel;
  /** 預估可釋放空間 (Bytes) - 掃描後填寫 */
  estimatedSize?: number;
  /** 是否預設勾選 */
  defaultSelected: boolean;
}

// ==========================================
// 4. 絕對保護白名單 (Hard-Coded System Whitelist)
// ==========================================

export const SYSTEM_PROTECTED_WHITELIST = [
  /^C:\\Windows\\System32/i,
  /^C:\\Windows\\WinSxS/i,
  /^C:\\pagefile\.sys$/i,
  /^C:\\hiberfil\.sys$/i,
  /^C:\\swapfile\.sys$/i,
  /^C:\\Boot/i,
  /^C:\\EFI/i,
];
