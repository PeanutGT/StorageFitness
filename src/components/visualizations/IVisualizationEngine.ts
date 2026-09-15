/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash (視覺化架構與 UX)
 * 模組：視覺化引擎統一抽象介面 (src/components/visualizations/IVisualizationEngine.ts)
 * 說明：定義所有磁碟視覺化展示引擎（如 Treemap、ListView、Sunburst 等）必須遵循之生命週期與互動介面。
 */

import type { MftRecordSummary } from '../../shared/ipc-contracts';

export type NodeClickCallback = (node: MftRecordSummary) => void;

export interface IVisualizationEngine {
  /**
   * 設定當前要渲染或展示的根節點資料 (目錄或子目錄)
   * @param node 目標節點
   */
  setRootNode(node: MftRecordSummary): void;

  /**
   * 當視窗縮放或容器尺寸改變時，重新計算排版與自適應佈局
   */
  resize(): void;

  /**
   * 註冊節點點擊互動回呼函式（通常用於資料夾下鑽 Zoom-in 操作）
   * @param callback 點擊處理函式
   */
  setOnNodeClick(callback: NodeClickCallback): void;

  /**
   * 顯示視覺化引擎所屬容器與輔助元件
   */
  show(): void;

  /**
   * 隱藏視覺化引擎所屬容器與輔助元件
   */
  hide(): void;
}
