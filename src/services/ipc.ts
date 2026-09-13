/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：Tauri IPC 服務橋接層 (src/services/ipc.ts)
 * 說明：提供與 Rust 後端通訊的高可用介面，自帶 Browser Preview 降級模擬支援。
 */

import { invoke } from '@tauri-apps/api/core';
import type { MftRecordSummary } from '../shared/ipc-contracts';

/**
 * 檢查當前是否運行於 Tauri 桌面環境中
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 格式化檔案大小為人類可讀字串 (Bytes -> KB, MB, GB, TB)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 產生高品質的模擬資料（當在純瀏覽器中預覽或開發時使用）
 */
function createMockDiskTree(rootPath: string): MftRecordSummary {
  return {
    id: 'mock-root',
    name: rootPath,
    path: rootPath,
    sizeBytes: 154800000000,
    isDirectory: true,
    isReparsePoint: false,
    depth: 0,
    children: [
      {
        id: 'mock-node-modules',
        name: 'node_modules',
        path: `${rootPath}\\Projects\\StorageFitness\\node_modules`,
        sizeBytes: 1820000000,
        isDirectory: true,
        isReparsePoint: false,
        depth: 1,
        children: [
          {
            id: 'mock-vite',
            name: 'vite',
            path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\vite`,
            sizeBytes: 420000000,
            isDirectory: true,
            isReparsePoint: false,
            depth: 2,
            children: [
              { id: 'f1', name: 'client.mjs', path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\vite\\client.mjs`, sizeBytes: 120000000, isDirectory: false, isReparsePoint: false, depth: 3, extension: 'mjs' },
              { id: 'f2', name: 'vite.bundle.js', path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\vite\\vite.bundle.js`, sizeBytes: 300000000, isDirectory: false, isReparsePoint: false, depth: 3, extension: 'js' },
            ]
          },
          {
            id: 'mock-typescript',
            name: 'typescript',
            path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\typescript`,
            sizeBytes: 850000000,
            isDirectory: true,
            isReparsePoint: false,
            depth: 2,
            children: [
              { id: 'f3', name: 'typescript.js', path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\typescript\\typescript.js`, sizeBytes: 850000000, isDirectory: false, isReparsePoint: false, depth: 3, extension: 'js' },
            ]
          },
          {
            id: 'mock-symlink',
            name: '.bin (Junction/Symlink)',
            path: `${rootPath}\\Projects\\StorageFitness\\node_modules\\.bin`,
            sizeBytes: 4096,
            isDirectory: true,
            isReparsePoint: true,
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'mock-target',
        name: 'target (Rust Build)',
        path: `${rootPath}\\Projects\\StorageFitness\\src-tauri\\target`,
        sizeBytes: 4890000000,
        isDirectory: true,
        isReparsePoint: false,
        depth: 1,
        children: [
          { id: 'f4', name: 'tauri_app.exe', path: `${rootPath}\\Projects\\StorageFitness\\src-tauri\\target\\debug\\tauri_app.exe`, sizeBytes: 48000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'exe' },
          { id: 'f5', name: 'libtauri_app.rlib', path: `${rootPath}\\Projects\\StorageFitness\\src-tauri\\target\\debug\\libtauri_app.rlib`, sizeBytes: 2800000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'rlib' },
          { id: 'f6', name: 'deps.cache', path: `${rootPath}\\Projects\\StorageFitness\\src-tauri\\target\\debug\\deps.cache`, sizeBytes: 2042000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'cache' }
        ]
      },
      {
        id: 'mock-videos',
        name: 'Media & Captures',
        path: `${rootPath}\\Videos`,
        sizeBytes: 24500000000,
        isDirectory: true,
        isReparsePoint: false,
        depth: 1,
        children: [
          { id: 'f7', name: '4K_Gameplay_Capture.mp4', path: `${rootPath}\\Videos\\4K_Gameplay_Capture.mp4`, sizeBytes: 18200000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'mp4' },
          { id: 'f8', name: 'Dev_Walkthrough_Demo.mov', path: `${rootPath}\\Videos\\Dev_Walkthrough_Demo.mov`, sizeBytes: 6300000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'mov' }
        ]
      },
      {
        id: 'mock-downloads',
        name: 'Downloads',
        path: `${rootPath}\\Downloads`,
        sizeBytes: 12400000000,
        isDirectory: true,
        isReparsePoint: false,
        depth: 1,
        children: [
          { id: 'f9', name: 'VSCodeSetup-x64.exe', path: `${rootPath}\\Downloads\\VSCodeSetup-x64.exe`, sizeBytes: 95000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'exe' },
          { id: 'f10', name: 'Windows11_23H2_ISO.iso', path: `${rootPath}\\Downloads\\Windows11_23H2_ISO.iso`, sizeBytes: 5800000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'iso' },
          { id: 'f11', name: 'Dataset_Archive.zip', path: `${rootPath}\\Downloads\\Dataset_Archive.zip`, sizeBytes: 6505000000, isDirectory: false, isReparsePoint: false, depth: 2, extension: 'zip' }
        ]
      }
    ]
  };
}

/**
 * 掃描目標目錄
 * @param path 要掃描的目錄絕對路徑
 */
export async function scanDirectory(path: string): Promise<MftRecordSummary> {
  if (isTauriEnvironment()) {
    return await invoke<MftRecordSummary>('scan_directory', { path });
  }

  // 瀏覽器預覽降級模式 (提供絲滑體驗)
  console.info(`[StorageFitness DevMode] Mocking directory scan for: ${path}`);
  await new Promise(resolve => setTimeout(resolve, 600)); // 模擬極速掃描延遲
  return createMockDiskTree(path);
}

/**
 * 驗證指定路徑是否安全 (非系統核心保護區)
 */
export async function checkPathSafety(path: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    return await invoke<boolean>('check_path_safety', { path });
  }

  // 前端降級驗證
  const isProtected = /^(C:\\Windows|C:\\pagefile|C:\\hiberfil|C:\\Boot|C:\\EFI)/i.test(path);
  return !isProtected;
}

/**
 * 檢查目標路徑是否為 Reparse Point (Junction / Symlink)
 */
export async function isReparsePoint(path: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    return await invoke<boolean>('is_reparse_point', { path });
  }
  return path.includes('.bin') || path.includes('symlink');
}
