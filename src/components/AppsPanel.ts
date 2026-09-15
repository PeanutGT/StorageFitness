import { isTauriEnvironment } from '../utils/env';
import type { InstalledApp } from '../shared/ipc-contracts';
import { getInstalledApps, uninstallApp, formatBytes } from '../services/ipc';

export class AppsPanelComponent {
  private container: HTMLElement;
  private apps: InstalledApp[] = [];
  private sortAscending: boolean = false;
  private sortField: 'size' | 'name' = 'size';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public show(): void {
    this.container.style.display = 'block';
    this.loadApps();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private async loadApps(): Promise<void> {
    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto; display: flex; align-items: center; justify-content: center;">
        <div style="color: var(--accent-cyan); font-size: 1.2rem; display: flex; align-items: center; gap: 12px;">
          <div class="spinner" style="width: 24px; height: 24px; border: 3px solid rgba(0, 242, 254, 0.2); border-top-color: var(--accent-cyan); border-radius: 50%; animation: spin 1s linear infinite;"></div>
          正在從登錄檔深度掃描應用程式...
        </div>
      </div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;

    try {
      this.apps = await getInstalledApps();
      this.render();
    } catch (e) {
      this.container.innerHTML = `<div style="padding: 40px; color: var(--accent-pink);">讀取失敗: ${e}</div>`;
    }
  }

  private sortApps() {
    this.apps.sort((a, b) => {
      if (this.sortField === 'size') {
        const sizeA = a.estimatedSizeBytes || 0;
        const sizeB = b.estimatedSizeBytes || 0;
        return this.sortAscending ? sizeA - sizeB : sizeB - sizeA;
      } else {
        const nameA = a.displayName.toLowerCase();
        const nameB = b.displayName.toLowerCase();
        if (nameA < nameB) return this.sortAscending ? -1 : 1;
        if (nameA > nameB) return this.sortAscending ? 1 : -1;
        return 0;
      }
    });
  }

  public render(): void {
    this.sortApps();

    const totalSize = this.apps.reduce((acc, app) => acc + (app.estimatedSizeBytes || 0), 0);

    let listHtml = '';
    
    if (this.apps.length === 0) {
      listHtml = '<div style="color: var(--text-muted); padding: 40px; text-align: center;">尚未找到任何已安裝的應用程式</div>';
    } else {
      listHtml = this.apps.map(app => {
        const isSystem = app.publisher?.toLowerCase().includes('microsoft') || app.displayName.toLowerCase().includes('update') || app.displayName.toLowerCase().includes('redistributable');
        
        // 生成一個基於字串的統一 SVG 圖標
        const initial = app.displayName.charAt(0).toUpperCase();
        
        return `
        <div class="app-card" style="
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all var(--transition-fast);
        ">
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; overflow: hidden;">
            <div style="
              min-width: 44px; height: 44px; 
              background: linear-gradient(135deg, rgba(0,242,254,0.1), rgba(79,172,254,0.2));
              border: 1px solid rgba(0, 242, 254, 0.3);
              border-radius: var(--radius-sm);
              display: flex; align-items: center; justify-content: center;
              font-size: 1.2rem; font-weight: 800; color: var(--accent-cyan);
            ">
              ${initial}
            </div>
            <div style="overflow: hidden;">
              <div style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 8px;">
                ${app.displayName}
                ${isSystem ? '<span style="font-size: 0.7rem; background: rgba(255, 183, 3, 0.15); color: var(--accent-amber); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 183, 3, 0.3);">系統組件</span>' : ''}
              </div>
              <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${app.publisher || '未知發行商'} ${app.displayVersion ? `| v${app.displayVersion}` : ''}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 24px;">
            <div style="text-align: right; min-width: 80px;">
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 700; color: var(--accent-cyan);">
                ${app.estimatedSizeBytes ? formatBytes(app.estimatedSizeBytes) : '<span style="color:var(--text-muted);font-size:0.9rem;">未知</span>'}
              </div>
            </div>
            <button class="btn-uninstall" data-id="${app.id}" data-system="${isSystem}" style="
              background: transparent;
              border: 1px solid var(--border-glass);
              color: var(--text-primary);
              padding: 8px 16px;
              border-radius: var(--radius-sm);
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            ">解除安裝</button>
          </div>
        </div>
      `;
      }).join('');
    }

    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto;" id="apps-scroll-container">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px;">
          <div>
            <h2 style="font-size: 1.6rem; font-weight: 800; background: linear-gradient(135deg, #fff, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">應用程式管理</h2>
            <p style="color: var(--text-secondary); font-size: 0.92rem; margin: 4px 0 0 0;">共發現 ${this.apps.length} 個應用程式</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-muted);">總估算大小</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent-cyan); font-family: 'JetBrains Mono', monospace;">
              ${formatBytes(totalSize)}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
          <button id="btn-sort-size" style="
            background: ${this.sortField === 'size' ? 'rgba(0, 242, 254, 0.15)' : 'var(--bg-surface)'};
            border: 1px solid ${this.sortField === 'size' ? 'var(--accent-cyan)' : 'var(--border-glass)'};
            color: ${this.sortField === 'size' ? 'var(--accent-cyan)' : 'var(--text-secondary)'};
            padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem; font-weight: 600;
          ">按大小排序 ${this.sortField === 'size' ? (this.sortAscending ? '↑' : '↓') : ''}</button>
          
          <button id="btn-sort-name" style="
            background: ${this.sortField === 'name' ? 'rgba(0, 242, 254, 0.15)' : 'var(--bg-surface)'};
            border: 1px solid ${this.sortField === 'name' ? 'var(--accent-cyan)' : 'var(--border-glass)'};
            color: ${this.sortField === 'name' ? 'var(--accent-cyan)' : 'var(--text-secondary)'};
            padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem; font-weight: 600;
          ">按名稱排序 ${this.sortField === 'name' ? (this.sortAscending ? '↑' : '↓') : ''}</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
          ${listHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    this.container.querySelector('#btn-sort-size')?.addEventListener('click', () => {
      if (this.sortField === 'size') {
        this.sortAscending = !this.sortAscending;
      } else {
        this.sortField = 'size';
        this.sortAscending = false;
      }
      this.render();
    });

    this.container.querySelector('#btn-sort-name')?.addEventListener('click', () => {
      if (this.sortField === 'name') {
        this.sortAscending = !this.sortAscending;
      } else {
        this.sortField = 'name';
        this.sortAscending = true;
      }
      this.render();
    });

    this.container.querySelectorAll('.btn-uninstall').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const appId = target.getAttribute('data-id');
        const isSystem = target.getAttribute('data-system') === 'true';
        
        const app = this.apps.find(a => a.id === appId);
        if (!app) return;

        if (!app.uninstallString) {
          alert('無法取得此軟體的解除安裝指令。');
          return;
        }

        if (isSystem) {
          const confirmMsg = `⚠️ 警告：\n\n「${app.displayName}」可能是系統核心組件或必要的驅動程式。\n解除安裝可能會導致其他軟體或 Windows 系統運作異常！\n\n您確定要繼續解除安裝嗎？`;
          if (!confirm(confirmMsg)) {
            return;
          }
        } else {
          if (!confirm(`是否確定要解除安裝「${app.displayName}」？\n這將會啟動該軟體的解除安裝程式。`)) {
            return;
          }
        }

        target.textContent = '執行中...';
        target.style.opacity = '0.7';
        (target as HTMLButtonElement).disabled = true;

        try {
          await uninstallApp(app.uninstallString);
          alert(`已啟動 ${app.displayName} 的解除安裝程式。\n完成後，請重新整理清單以確認。`);
          // 可選: 重新載入 loadApps()
        } catch (error) {
          alert(`解除安裝失敗: ${error}`);
        } finally {
          target.textContent = '解除安裝';
          target.style.opacity = '1';
          (target as HTMLButtonElement).disabled = false;
        }
      });
      
      btn.addEventListener('mouseover', () => {
        (btn as HTMLElement).style.background = 'rgba(255, 51, 102, 0.1)';
        (btn as HTMLElement).style.borderColor = 'var(--accent-pink)';
        (btn as HTMLElement).style.color = 'var(--accent-pink)';
      });
      btn.addEventListener('mouseout', () => {
        (btn as HTMLElement).style.background = 'transparent';
        (btn as HTMLElement).style.borderColor = 'var(--border-glass)';
        (btn as HTMLElement).style.color = 'var(--text-primary)';
      });
    });
  }
}
