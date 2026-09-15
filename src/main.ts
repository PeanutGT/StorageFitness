/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：前端主入口與應用程式調度中心 (src/main.ts)
 * 說明：整合 Standard Scanner 與 NTFS $MFT 極速直讀掃描、UAC 提權監控及全域狀態調度。
 */

import { SidebarComponent } from './components/Sidebar';
import { TreemapEngine } from './components/visualizations/TreemapEngine';
import { ListViewEngine } from './components/visualizations/ListViewEngine';
import type { IVisualizationEngine } from './components/visualizations/IVisualizationEngine';
import { CleanerPanelComponent } from './components/CleanerPanel';
import { HealthPanelComponent } from './components/HealthPanel';
import { SettingsPanelComponent } from './components/SettingsPanel';
import { AppsPanelComponent } from './components/AppsPanel';

import { 
  scanDirectory, 
  scanDirectoryMft, 
  checkAdminStatus, 
  formatBytes, 
  checkPathSafety,
  openDirectoryDialog
} from './services/ipc';
import type { MftRecordSummary } from './shared/ipc-contracts';

export type ViewMode = 'treemap' | 'list';

class StorageFitnessApp {
  private sidebar!: SidebarComponent;
  private treemapEngine!: TreemapEngine;
  private listViewEngine!: ListViewEngine;
  private currentViewMode: ViewMode = 'treemap';
  private cleanerPanel!: CleanerPanelComponent;
  private healthPanel!: HealthPanelComponent;
  private settingsPanel!: SettingsPanelComponent;
  private appsPanel!: AppsPanelComponent;


  // 狀態管理
  private currentRootTree: MftRecordSummary | null = null;
  private breadcrumbStack: MftRecordSummary[] = [];
  private isScanning: boolean = false;
  private isAdminUser: boolean = false;

  public getSidebar(): SidebarComponent { return this.sidebar; }
  public getCleanerPanel(): CleanerPanelComponent { return this.cleanerPanel; }
  public getHealthPanel(): HealthPanelComponent { return this.healthPanel; }
  public getSettingsPanel(): SettingsPanelComponent { return this.settingsPanel; }
  public getAppsPanel(): AppsPanelComponent { return this.appsPanel; }

  public getCurrentRootTree(): MftRecordSummary | null { return this.currentRootTree; }
  public getTreemapEngine(): TreemapEngine { return this.treemapEngine; }
  public getListViewEngine(): ListViewEngine { return this.listViewEngine; }
  public getCurrentViewMode(): ViewMode { return this.currentViewMode; }

  // DOM 元素引用
  private pathInput!: HTMLInputElement;
  private scanBtn!: HTMLButtonElement;
  private scanBtnLabel!: HTMLElement;
  private visualizerHeaderBar!: HTMLElement;
  private breadcrumbBar!: HTMLElement;
  private btnViewTreemap!: HTMLButtonElement;
  private btnViewList!: HTMLButtonElement;
  private metricsStrip!: HTMLElement;
  private metricTotalSize!: HTMLElement;
  private metricFilesCount!: HTMLElement;
  private metricReparseCount!: HTMLElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;

  // 各分頁視圖
  private viewVisualizer!: HTMLElement;
  private viewCleaner!: HTMLElement;
  private viewHealth!: HTMLElement;
  private viewSettings!: HTMLElement;
  private viewApps!: HTMLElement;

  
  // 歡迎畫面
  private welcomeScreen!: HTMLElement;

  constructor() {
    this.initDOMReferences();
    this.initComponents();
    this.setupEvents();
    
    // 初始化系統管理員權限狀態
    this.initAdminStatus();
  }

  private initDOMReferences(): void {
    this.pathInput = document.getElementById('target-path-input') as HTMLInputElement;
    this.scanBtn = document.getElementById('btn-start-scan') as HTMLButtonElement;
    this.scanBtnLabel = document.getElementById('scan-btn-label') as HTMLElement;
    this.visualizerHeaderBar = document.getElementById('visualizer-header-bar') as HTMLElement;
    this.breadcrumbBar = document.getElementById('breadcrumb-bar') as HTMLElement;
    this.btnViewTreemap = document.getElementById('btn-view-treemap') as HTMLButtonElement;
    this.btnViewList = document.getElementById('btn-view-list') as HTMLButtonElement;
    this.metricsStrip = document.getElementById('metrics-strip') as HTMLElement;
    this.metricTotalSize = document.getElementById('metric-total-size') as HTMLElement;
    this.metricFilesCount = document.getElementById('metric-files-count') as HTMLElement;
    this.metricReparseCount = document.getElementById('metric-reparse-count') as HTMLElement;
    this.statusDot = document.getElementById('status-dot') as HTMLElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;

    this.viewVisualizer = document.getElementById('view-visualizer') as HTMLElement;
    this.viewCleaner = document.getElementById('view-cleaner') as HTMLElement;
    this.viewHealth = document.getElementById('view-health') as HTMLElement;
    this.viewSettings = document.getElementById('view-settings') as HTMLElement;
    this.viewApps = document.getElementById('view-apps') as HTMLElement;

    this.welcomeScreen = document.getElementById('welcome-screen') as HTMLElement;
  }

  private initComponents(): void {
    // 1. 初始化側邊欄 (傳入 MFT 深度掃描處理函式)
    const sidebarContainer = document.getElementById('sidebar-container') as HTMLElement;
    this.sidebar = new SidebarComponent(
      sidebarContainer, 
      (tabId) => this.switchTab(tabId),
      (driveLetter) => this.triggerMftScan(driveLetter)
    );

    // 2. 初始化視覺化引擎 (Treemap + ListView)
    const canvas = document.getElementById('treemap-canvas') as HTMLCanvasElement;
    const tooltip = document.getElementById('treemap-tooltip') as HTMLElement;
    const legend = document.getElementById('treemap-legend') as HTMLElement;
    const listviewContainer = document.getElementById('listview-container') as HTMLElement;

    this.treemapEngine = new TreemapEngine(canvas, tooltip, legend);
    this.treemapEngine.setOnNodeClick((node) => this.handleNodeClick(node));

    this.listViewEngine = new ListViewEngine(listviewContainer);
    this.listViewEngine.setOnNodeClick((node) => this.handleNodeClick(node));

    // 讀取偏好視圖模式 (預設為 'treemap')
    const savedMode = localStorage.getItem('preferred-view-mode') as ViewMode | null;
    const initialMode: ViewMode = (savedMode === 'list' || savedMode === 'treemap') ? savedMode : 'treemap';
    this.setViewMode(initialMode, false);

    // 3. 初始化子面板
    this.cleanerPanel = new CleanerPanelComponent(this.viewCleaner);
    this.healthPanel = new HealthPanelComponent(this.viewHealth);
    this.settingsPanel = new SettingsPanelComponent(this.viewSettings);
    this.appsPanel = new AppsPanelComponent(this.viewApps);

  }

  /**
   * 切換視覺化檢視模式 (Treemap / ListView) 並持久化偏好設定
   */
  public setViewMode(mode: ViewMode, savePreference: boolean = true): void {
    this.currentViewMode = mode;

    if (!this.currentRootTree) {
      // 若尚未進行任何掃描，顯示歡迎面板，並隱藏圖表
      if (this.welcomeScreen) this.welcomeScreen.style.display = 'flex';
      this.treemapEngine.hide();
      this.listViewEngine.hide();
    } else {
      // 有資料時隱藏歡迎面板，並顯示對應視圖
      if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';

      if (mode === 'treemap') {
        this.btnViewTreemap.classList.add('active');
        this.btnViewList.classList.remove('active');
        this.listViewEngine.hide();
        this.treemapEngine.show();
      } else {
        this.btnViewList.classList.add('active');
        this.btnViewTreemap.classList.remove('active');
        this.treemapEngine.hide();
        this.listViewEngine.show();
      }

      const activeNode = this.breadcrumbStack[this.breadcrumbStack.length - 1] || this.currentRootTree;
      if (activeNode) {
        this.getActiveEngine().setRootNode(activeNode);
        this.getActiveEngine().resize();
      }
    }

    if (savePreference) {
      try {
        localStorage.setItem('preferred-view-mode', mode);
      } catch (e) {
        console.warn('Failed to save preferred view mode:', e);
      }
    }
  }

  public getActiveEngine(): IVisualizationEngine {
    return this.currentViewMode === 'treemap' ? this.treemapEngine : this.listViewEngine;
  }

  /**
   * 初始化檢查是否具備 Windows Administrator 權限
   */
  private async initAdminStatus(): Promise<void> {
    try {
      this.isAdminUser = await checkAdminStatus();
      this.sidebar.setAdminStatus(this.isAdminUser);

      const engineTag = document.querySelector('.status-right span:first-child');
      if (engineTag) {
        engineTag.textContent = this.isAdminUser 
          ? '引擎: NTFS $MFT Direct (Admin)' 
          : '引擎: Standard Win32 API';
      }
    } catch (e) {
      console.warn('Failed to check admin status:', e);
    }
  }

  private switchTab(tabId: string): void {
    // 隱藏所有視圖
    this.viewVisualizer.style.display = 'none';
    this.viewCleaner.style.display = 'none';
    this.viewHealth.style.display = 'none';
    this.viewSettings.style.display = 'none';
    this.viewApps.style.display = 'none';
    this.appsPanel.hide();

    // 依據選中項目顯示對應視圖
    if (tabId === 'visualizer') {
      this.viewVisualizer.style.display = 'block';
      this.visualizerHeaderBar.style.display = 'flex';
      this.metricsStrip.style.display = 'flex';
      this.getActiveEngine().resize();
    } else {
      this.visualizerHeaderBar.style.display = 'none';
      this.metricsStrip.style.display = 'none';

      if (tabId === 'cleaner') this.viewCleaner.style.display = 'block';
      if (tabId === 'health') {
        this.healthPanel.show();
      }
      if (tabId === 'apps') {
        this.appsPanel.show();
      } else {
        this.appsPanel.hide();
      }
      if (tabId === 'settings') this.viewSettings.style.display = 'block';
    }
  }

  private setupEvents(): void {
    // 掃描按鈕點擊 (標準目錄掃描)
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

    // 歡迎面板的大按鈕
    document.querySelectorAll('.btn-scan-drive').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (target && !this.isScanning) {
          this.pathInput.value = target;
          this.triggerScan(target);
        }
      });
    });

    // 瀏覽選擇資料夾圖示
    const handleBrowseClick = async () => {
      if (this.isScanning) return;
      const selectedPath = await openDirectoryDialog();
      if (selectedPath) {
        this.pathInput.value = selectedPath;
        this.triggerScan(selectedPath);
      }
    };
    document.getElementById('btn-browse-folder')?.addEventListener('click', handleBrowseClick);
    document.getElementById('btn-welcome-browse')?.addEventListener('click', handleBrowseClick);

    // 視覺化視圖模式切換
    this.btnViewTreemap.addEventListener('click', () => {
      if (this.currentViewMode !== 'treemap') {
        this.setViewMode('treemap', true);
      }
    });

    this.btnViewList.addEventListener('click', () => {
      if (this.currentViewMode !== 'list') {
        this.setViewMode('list', true);
      }
    });

    // 視窗自適應
    window.addEventListener('resize', () => {
      this.getActiveEngine().resize();
    });
  }

  /**
   * 觸發標準權限目錄掃描 (Standard Win32 API)
   */
  public async triggerScan(targetPath: string): Promise<void> {
    const trimmedPath = targetPath.trim();
    if (!trimmedPath) return;

    this.isScanning = true;
    this.scanBtn.classList.add('scanning');
    this.scanBtnLabel.textContent = '掃描中...';
    this.statusDot.className = 'status-dot scanning';
    this.statusDot.style.background = 'var(--accent-cyan)';
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

      // 同步更新雙視覺化引擎
      this.treemapEngine.setRootNode(tree);
      this.listViewEngine.setRootNode(tree);
      this.renderBreadcrumbs();
      this.setViewMode(this.currentViewMode, false);

      this.statusDot.className = 'status-dot';
      this.statusDot.style.background = 'var(--accent-emerald)';
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
   * 觸發 NTFS $MFT 二進位直讀全磁碟極速解析 (需管理員權限)
   */
  public async triggerMftScan(driveLetter: string = 'C'): Promise<void> {
    if (this.isScanning) return;

    const cleanDrive = (driveLetter.replace(/[^a-zA-Z]/g, '').slice(0, 1) || 'C').toUpperCase();
    this.isScanning = true;
    this.sidebar.setScanning(true);
    this.statusDot.className = 'status-dot scanning';
    this.statusDot.style.background = 'var(--accent-cyan)';
    this.statusText.textContent = `⚡ 正在透過 NTFS $MFT 二進位直讀引擎解析全磁碟 (${cleanDrive}:)...`;

    try {
      const startTime = performance.now();
      const tree = await scanDirectoryMft(cleanDrive);
      const elapsed = Math.round(performance.now() - startTime);

      this.currentRootTree = tree;
      this.breadcrumbStack = [tree];

      // 同步更新輸入框與導航標籤
      this.pathInput.value = `${cleanDrive}:\\`;

      // 更新指標
      this.updateMetrics(tree);

      // 觸發清理規則容量精算
      this.cleanerPanel.analyze(tree);

      // 同步更新雙視覺化引擎
      this.treemapEngine.setRootNode(tree);
      this.listViewEngine.setRootNode(tree);
      this.renderBreadcrumbs();
      this.setViewMode(this.currentViewMode, false);

      this.statusDot.className = 'status-dot';
      this.statusDot.style.background = 'var(--accent-emerald)';
      this.statusText.textContent = `⚡ NTFS $MFT 極速解析完成！耗時 ${elapsed} ms (共計 ${this.countFiles(tree)} 個節點)`;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error('MFT Scan error:', err);

      if (errMsg.includes('ELEVATION_REQUIRED')) {
        this.statusDot.className = 'status-dot';
        this.statusDot.style.background = 'var(--accent-amber)';
        this.statusText.textContent = `⚠️ 掃描取消：${errMsg.replace('ELEVATION_REQUIRED:', '').trim()}`;
      } else {
        this.statusDot.className = 'status-dot';
        this.statusDot.style.background = 'var(--accent-danger)';
        this.statusText.textContent = `MFT 掃描發生錯誤: ${errMsg}`;
      }
    } finally {
      this.isScanning = false;
      this.sidebar.setScanning(false);
    }
  }

  /**
   * 節點點擊互動：若是資料夾則下鑽 (Zoom in)
   */
  private handleNodeClick(node: MftRecordSummary): void {
    if (node.isDirectory && node.children && node.children.length > 0) {
      this.breadcrumbStack.push(node);
      this.treemapEngine.setRootNode(node);
      this.listViewEngine.setRootNode(node);
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
          this.treemapEngine.setRootNode(targetNode);
          this.listViewEngine.setRootNode(targetNode);
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
