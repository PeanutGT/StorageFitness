/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：側邊欄導航與硬碟容量卡片元件 (src/components/Sidebar.ts)
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
  private onTabChange?: (tabId: string) => void;

  constructor(container: HTMLElement, onTabChange?: (tabId: string) => void) {
    this.container = container;
    this.onTabChange = onTabChange;
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
        <li class="nav-item" data-tab="security">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>白名單與防禦</span>
        </li>
        <li class="nav-item" data-tab="settings">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>系統設定</span>
        </li>
      </ul>

      <div class="sidebar-disk-card">
        <div class="disk-card-header">
          <span class="disk-card-title">本機磁碟 (C:)</span>
          <span>NTFS</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: 68%;"></div>
        </div>
        <div class="disk-capacity-label">
          <span>已用 340 GB</span>
          <span>總計 512 GB</span>
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
  }
}
