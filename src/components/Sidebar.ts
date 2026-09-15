/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：側邊欄導航與硬碟容量卡片元件 (src/components/Sidebar.ts)
 * 說明：整合 MFT 極速掃描按鈕、UAC 提權盾牌動態顯示與分頁切換。
 */

export interface NavItemDef {
  id: string;
  label: string;
  iconSvg: string;
  badge?: string;
}

export class SidebarComponent {
  private container: HTMLElement;
  private activeTabId: string = 'visualizer';
  private isAdmin: boolean = false;
  private isScanningMft: boolean = false;
  private onTabChange?: (tabId: string) => void;
  private onMftScan?: (driveLetter: string) => void;

  constructor(
    container: HTMLElement, 
    onTabChange?: (tabId: string) => void,
    onMftScan?: (driveLetter: string) => void
  ) {
    this.container = container;
    this.onTabChange = onTabChange;
    this.onMftScan = onMftScan;
    this.render();
  }

  public getActiveTab(): string {
    return this.activeTabId;
  }

  public setActiveTab(tabId: string): void {
    this.activeTabId = tabId;
    const items = this.container.querySelectorAll('.nav-item');
    items.forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * 更新系統管理員狀態，連動更新 UAC 盾牌圖示與狀態標籤
   */
  public setAdminStatus(isAdmin: boolean): void {
    this.isAdmin = isAdmin;
    this.updateUacShieldState();
  }

  /**
   * 更新 MFT 掃描進行狀態
   */
  public setScanning(isScanning: boolean): void {
    this.isScanningMft = isScanning;
    const btn = this.container.querySelector('#sidebar-btn-mft-scan') as HTMLButtonElement | null;
    const textSpan = this.container.querySelector('#mft-btn-text') as HTMLElement | null;

    if (btn && textSpan) {
      if (isScanning) {
        btn.classList.add('scanning');
        btn.disabled = true;
        textSpan.textContent = 'MFT 解析中...';
      } else {
        btn.classList.remove('scanning');
        btn.disabled = false;
        textSpan.textContent = '極速深度掃描 (MFT)';
      }
    }
  }

  private updateUacShieldState(): void {
    const shieldContainer = this.container.querySelector('#sidebar-uac-indicator');
    const hintContainer = this.container.querySelector('#mft-status-hint');

    if (shieldContainer) {
      shieldContainer.className = `uac-shield-indicator ${this.isAdmin ? 'admin-granted' : 'elevation-needed'}`;
      shieldContainer.innerHTML = this.isAdmin
        ? `
          <svg class="shield-granted-icon" viewBox="0 0 24 24" title="已獲取系統管理員權限">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        `
        : `
          <svg class="shield-uac-icon" viewBox="0 0 24 24" title="需要系統管理員權限 (UAC)">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        `;
    }

    if (hintContainer) {
      hintContainer.innerHTML = this.isAdmin
        ? `<span class="hint-dot ready"></span><span class="hint-text">MFT 核心已就緒</span>`
        : `<span class="hint-dot uac"></span><span class="hint-text">需管理員權限 (UAC)</span>`;
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="brand-header">
        <div class="brand-logo-icon">
          <svg viewBox="0 0 24 24">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <div>
          <div class="brand-name">StorageFitness</div>
          <span class="brand-badge">v0.1 Ultra</span>
        </div>
      </div>

      <ul class="nav-menu">
        <li class="nav-item active" data-tab="visualizer">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          <span>磁碟視覺化</span>
        </li>
        <li class="nav-item" data-tab="cleaner">
          <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          <span>智慧瘦身清理</span>
        </li>
        <li class="nav-item" data-tab="health">
          <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
          <span>健康儀表板</span>
        </li>
        <li class="nav-item" data-tab="apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>應用程式管理</span>
        </li>
        <li class="nav-item" data-tab="settings">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>系統設定</span>
        </li>
      </ul>

      <!-- 側邊欄硬碟卡片與 MFT 極速掃描區塊 -->
      <div class="sidebar-disk-card">
        <div class="disk-card-header">
          <span class="disk-card-title">本機磁碟 (C:)</span>
          <span class="disk-fs-badge">NTFS $MFT</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: 68%;"></div>
        </div>
        <div class="disk-capacity-label">
          <span>已用 340 GB</span>
          <span>總計 512 GB</span>
        </div>

        <div class="sidebar-mft-box">
          <button class="btn-mft-scan" id="sidebar-btn-mft-scan" type="button" title="直接讀取 NTFS Volume Handle 二進位二級結構，極速建樹">
            <div class="btn-mft-content">
              <svg class="mft-rocket-icon" viewBox="0 0 24 24">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span id="mft-btn-text">極速深度掃描 (MFT)</span>
            </div>
            <div class="uac-shield-indicator elevation-needed" id="sidebar-uac-indicator">
              <svg class="shield-uac-icon" viewBox="0 0 24 24" title="需要系統管理員權限 (UAC)">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          </button>
          <div class="mft-status-hint" id="mft-status-hint">
            <span class="hint-dot uac"></span>
            <span class="hint-text">需管理員權限 (UAC)</span>
          </div>
        </div>
      </div>
    `;

    // 綁定選單點擊事件
    this.container.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) {
          this.setActiveTab(tab);
          if (this.onTabChange) this.onTabChange(tab);
        }
      });
    });

    // 綁定 MFT 極速掃描按鈕點擊事件
    const mftBtn = this.container.querySelector('#sidebar-btn-mft-scan');
    mftBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.isScanningMft && this.onMftScan) {
        this.onMftScan('C');
      }
    });

    // 初始化狀態外觀
    this.updateUacShieldState();
  }
}
