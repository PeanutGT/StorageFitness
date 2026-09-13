/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：前端主入口與應用程式調度中心 (src/main.ts)
 */

import { SidebarComponent } from './components/Sidebar';
import { TreemapEngine } from './components/Treemap';
import { CleanerPanelComponent } from './components/CleanerPanel';
import { SecurityPanelComponent } from './components/SecurityPanel';
import { SettingsPanelComponent } from './components/SettingsPanel';
import { scanDirectory, formatBytes, checkPathSafety } from './services/ipc';
import type { MftRecordSummary } from './shared/ipc-contracts';

class StorageFitnessApp {
  private sidebar!: SidebarComponent;
  private treemap!: TreemapEngine;
  private cleanerPanel!: CleanerPanelComponent;
  private securityPanel!: SecurityPanelComponent;
  private settingsPanel!: SettingsPanelComponent;

  // 狀態管理
  private currentRootTree: MftRecordSummary | null = null;
  private breadcrumbStack: MftRecordSummary[] = [];
  private isScanning: boolean = false;

  public getSidebar(): SidebarComponent { return this.sidebar; }
  public getCleanerPanel(): CleanerPanelComponent { return this.cleanerPanel; }
  public getSecurityPanel(): SecurityPanelComponent { return this.securityPanel; }
  public getSettingsPanel(): SettingsPanelComponent { return this.settingsPanel; }
  public getCurrentRootTree(): MftRecordSummary | null { return this.currentRootTree; }

  // DOM 元素引用
  private pathInput!: HTMLInputElement;
  private scanBtn!: HTMLButtonElement;
  private scanBtnLabel!: HTMLElement;
  private breadcrumbBar!: HTMLElement;
  private metricsStrip!: HTMLElement;
  private metricTotalSize!: HTMLElement;
  private metricFilesCount!: HTMLElement;
  private metricReparseCount!: HTMLElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;

  // 各分頁視圖
  private viewVisualizer!: HTMLElement;
  private viewCleaner!: HTMLElement;
  private viewSecurity!: HTMLElement;
  private viewSettings!: HTMLElement;

  constructor() {
    this.initDOMReferences();
    this.initComponents();
    this.setupEvents();
    
    // 預設載入示範資料或立即掃描目前路徑
    this.triggerScan(this.pathInput.value);
  }

  private initDOMReferences(): void {
    this.pathInput = document.getElementById('target-path-input') as HTMLInputElement;
    this.scanBtn = document.getElementById('btn-start-scan') as HTMLButtonElement;
    this.scanBtnLabel = document.getElementById('scan-btn-label') as HTMLElement;
    this.breadcrumbBar = document.getElementById('breadcrumb-bar') as HTMLElement;
    this.metricsStrip = document.getElementById('metrics-strip') as HTMLElement;
    this.metricTotalSize = document.getElementById('metric-total-size') as HTMLElement;
    this.metricFilesCount = document.getElementById('metric-files-count') as HTMLElement;
    this.metricReparseCount = document.getElementById('metric-reparse-count') as HTMLElement;
    this.statusDot = document.getElementById('status-dot') as HTMLElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;

    this.viewVisualizer = document.getElementById('view-visualizer') as HTMLElement;
    this.viewCleaner = document.getElementById('view-cleaner') as HTMLElement;
    this.viewSecurity = document.getElementById('view-security') as HTMLElement;
    this.viewSettings = document.getElementById('view-settings') as HTMLElement;
  }

  private initComponents(): void {
    // 1. 初始化側邊欄
    const sidebarContainer = document.getElementById('sidebar-container') as HTMLElement;
    this.sidebar = new SidebarComponent(sidebarContainer, (tabId) => this.switchTab(tabId));

    // 2. 初始化 Treemap 畫布
    const canvas = document.getElementById('treemap-canvas') as HTMLCanvasElement;
    const tooltip = document.getElementById('treemap-tooltip') as HTMLElement;
    this.treemap = new TreemapEngine(canvas, tooltip);
    this.treemap.setOnNodeClick((node) => this.handleNodeClick(node));

    // 3. 初始化子面板
    this.cleanerPanel = new CleanerPanelComponent(this.viewCleaner);
    this.securityPanel = new SecurityPanelComponent(this.viewSecurity);
    this.settingsPanel = new SettingsPanelComponent(this.viewSettings);
  }

  private switchTab(tabId: string): void {
    // 隱藏所有視圖
    this.viewVisualizer.style.display = 'none';
    this.viewCleaner.style.display = 'none';
    this.viewSecurity.style.display = 'none';
    this.viewSettings.style.display = 'none';

    // 依據選中項目顯示對應視圖
    if (tabId === 'visualizer') {
      this.viewVisualizer.style.display = 'block';
      this.breadcrumbBar.style.display = 'flex';
      this.metricsStrip.style.display = 'flex';
      this.treemap.resize();
    } else {
      this.breadcrumbBar.style.display = 'none';
      this.metricsStrip.style.display = 'none';

      if (tabId === 'cleaner') this.viewCleaner.style.display = 'block';
      if (tabId === 'security') this.viewSecurity.style.display = 'block';
      if (tabId === 'settings') this.viewSettings.style.display = 'block';
    }
  }

  private setupEvents(): void {
    // 掃描按鈕點擊
    this.scanBtn.addEventListener('click', () => {
      if (!this.isScanning) {
        this.triggerScan(this.pathInput.value);
      }
    });

    // Enter 鍵觸發掃描
    this.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.isScanning) {
        this.triggerScan(this.pathInput.value);
      }
    });

    // 快速切換磁碟按鈕
    document.querySelectorAll('.drive-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.drive-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const drive = pill.getAttribute('data-drive');
        if (drive) {
          this.pathInput.value = drive;
          this.triggerScan(drive);
        }
      });
    });
  }

  /**
   * 觸發掃描任務
   */
  public async triggerScan(targetPath: string): Promise<void> {
    const trimmedPath = targetPath.trim();
    if (!trimmedPath) return;

    this.isScanning = true;
    this.scanBtn.classList.add('scanning');
    this.scanBtnLabel.textContent = '掃描中...';
    this.statusDot.className = 'status-dot scanning';
    this.statusText.textContent = `正在高速分析目錄: ${trimmedPath}`;

    try {
      // 進行安全白名單校驗
      const isSafe = await checkPathSafety(trimmedPath);
      if (!isSafe) {
        console.warn(`Protected path detected: ${trimmedPath}`);
      }

      const startTime = performance.now();
      const tree = await scanDirectory(trimmedPath);
      const elapsed = Math.round(performance.now() - startTime);

      this.currentRootTree = tree;
      this.breadcrumbStack = [tree];

      // 更新指標
      this.updateMetrics(tree);

      // 觸發清理規則容量精算
      this.cleanerPanel.analyze(tree);

      // 更新 Treemap 渲染
      this.treemap.setRootNode(tree);
      this.renderBreadcrumbs();

      this.statusDot.className = 'status-dot';
      this.statusText.textContent = `掃描完成！耗時 ${elapsed} ms (共計 ${this.countFiles(tree)} 個節點)`;
    } catch (err: any) {
      console.error('Scan error:', err);
      this.statusDot.className = 'status-dot';
      this.statusDot.style.background = 'var(--accent-danger)';
      this.statusText.textContent = `掃描發生錯誤: ${err?.message || err}`;
    } finally {
      this.isScanning = false;
      this.scanBtn.classList.remove('scanning');
      this.scanBtnLabel.textContent = '極速掃描';
    }
  }

  /**
   * 節點點擊互動：若是資料夾則下鑽 (Zoom in)
   */
  private handleNodeClick(node: MftRecordSummary): void {
    if (node.isDirectory && node.children && node.children.length > 0) {
      this.breadcrumbStack.push(node);
      this.treemap.setRootNode(node);
      this.renderBreadcrumbs();
      this.updateMetrics(node);
    }
  }

  /**
   * 渲染麵包屑導航列
   */
  private renderBreadcrumbs(): void {
    this.breadcrumbBar.innerHTML = '';

    this.breadcrumbStack.forEach((node, index) => {
      const isLast = index === this.breadcrumbStack.length - 1;

      const item = document.createElement('span');
      item.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
      item.textContent = node.name || node.path;
      item.addEventListener('click', () => {
        if (!isLast) {
          this.breadcrumbStack = this.breadcrumbStack.slice(0, index + 1);
          const targetNode = this.breadcrumbStack[this.breadcrumbStack.length - 1];
          this.treemap.setRootNode(targetNode);
          this.renderBreadcrumbs();
          this.updateMetrics(targetNode);
        }
      });

      this.breadcrumbBar.appendChild(item);

      if (!isLast) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = ' / ';
        this.breadcrumbBar.appendChild(separator);
      }
    });
  }

  /**
   * 更新統計指標數據
   */
  private updateMetrics(node: MftRecordSummary): void {
    this.metricTotalSize.textContent = formatBytes(node.sizeBytes);
    this.metricFilesCount.textContent = `${this.countFiles(node).toLocaleString()} 項`;
    this.metricReparseCount.textContent = `${this.countReparsePoints(node)} 個已阻斷`;
  }

  private countFiles(node: MftRecordSummary): number {
    let count = 1;
    if (node.children) {
      for (const c of node.children) {
        count += this.countFiles(c);
      }
    }
    return count;
  }

  private countReparsePoints(node: MftRecordSummary): number {
    let count = node.isReparsePoint ? 1 : 0;
    if (node.children) {
      for (const c of node.children) {
        count += this.countReparsePoints(c);
      }
    }
    return count;
  }
}

// 啟動應用程式
window.addEventListener('DOMContentLoaded', () => {
  new StorageFitnessApp();
});
