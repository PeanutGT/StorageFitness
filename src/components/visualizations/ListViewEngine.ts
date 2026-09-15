/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：詳細資料清單視圖引擎 (src/components/visualizations/ListViewEngine.ts)
 * 特色：Windows 檔案總管風格 Cyber-Glassmorphism 列表、容量佔比霓虹能量條、多欄位動態排序、資料夾下鑽下探
 */

import type { MftRecordSummary } from '../../shared/ipc-contracts';
import { formatBytes } from '../../services/ipc';
import type { IVisualizationEngine, NodeClickCallback } from './IVisualizationEngine';

type SortColumn = 'name' | 'size' | 'percent' | 'type';
type SortDirection = 'asc' | 'desc';

export class ListViewEngine implements IVisualizationEngine {
  private container: HTMLElement;
  private rootNode: MftRecordSummary | null = null;
  private onNodeClick?: NodeClickCallback;
  private isVisible: boolean = false;

  // 排序狀態 (預設依容量大小降冪排列)
  private currentSortCol: SortColumn = 'size';
  private currentSortDir: SortDirection = 'desc';

  // 搜尋過濾
  private filterQuery: string = '';

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderSkeleton();
  }

  public setOnNodeClick(callback: NodeClickCallback): void {
    this.onNodeClick = callback;
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    if (this.rootNode) {
      this.renderTableContent();
    }
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public resize(): void {
    // List view 採用流式 CSS 排版，必要時更新內部滾動區域
    if (!this.isVisible) return;
  }

  public setRootNode(node: MftRecordSummary): void {
    this.rootNode = node;
    if (this.isVisible) {
      this.renderTableContent();
    }
  }

  /**
   * 初次渲染外殼框架 (包含頂部搜尋列、統計資訊與表格骨架)
   */
  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="listview-wrapper">
        <!-- 清單頂部工具列 -->
        <div class="listview-toolbar">
          <div class="listview-search-wrapper">
            <svg class="search-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" class="listview-search-input" placeholder="在目前目錄中快速篩選項目..." spellcheck="false" />
            <button class="listview-search-clear" style="display: none;">&times;</button>
          </div>
          <div class="listview-stats-summary">
            <span class="listview-items-count">0 個項目</span>
            <span class="listview-stats-divider">·</span>
            <span class="listview-size-sum">0 B</span>
          </div>
        </div>

        <!-- 檔案資料清單表格容器 -->
        <div class="listview-table-container">
          <table class="listview-table">
            <thead>
              <tr>
                <th class="col-name sortable" data-col="name">
                  <div class="th-content">
                    <span>名稱</span>
                    <span class="sort-icon"></span>
                  </div>
                </th>
                <th class="col-size sortable" data-col="size">
                  <div class="th-content">
                    <span>大小</span>
                    <span class="sort-icon desc">▼</span>
                  </div>
                </th>
                <th class="col-percent sortable" data-col="percent">
                  <div class="th-content">
                    <span>佔比</span>
                    <span class="sort-icon"></span>
                  </div>
                </th>
                <th class="col-type sortable" data-col="type">
                  <div class="th-content">
                    <span>類型</span>
                    <span class="sort-icon"></span>
                  </div>
                </th>
                <th class="col-action">
                  <div class="th-content">
                    <span>操作</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody id="listview-table-body">
              <!-- 動態生成資料列 -->
            </tbody>
          </table>
          <div id="listview-empty-state" class="listview-empty" style="display: none;">
            <div class="empty-icon">📂</div>
            <div class="empty-title">目前資料夾為空或無子項目</div>
            <div class="empty-desc">此目錄中沒有其他檔案或下層資料夾。</div>
          </div>
        </div>
      </div>
    `;

    this.bindSkeletonEvents();
  }

  /**
   * 綁定骨架事件 (搜尋、清空、排序點擊、雙擊下鑽)
   */
  private bindSkeletonEvents(): void {
    const searchInput = this.container.querySelector('.listview-search-input') as HTMLInputElement;
    const searchClear = this.container.querySelector('.listview-search-clear') as HTMLButtonElement;

    searchInput.addEventListener('input', (e) => {
      this.filterQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      searchClear.style.display = this.filterQuery ? 'block' : 'none';
      this.renderTableContent();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      this.filterQuery = '';
      searchClear.style.display = 'none';
      this.renderTableContent();
      searchInput.focus();
    });

    // 欄位表頭排序點擊
    const sortHeaders = this.container.querySelectorAll('th.sortable');
    sortHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col') as SortColumn;
        if (this.currentSortCol === col) {
          this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.currentSortCol = col;
          this.currentSortDir = col === 'name' ? 'asc' : 'desc';
        }
        this.updateHeaderSortIcons();
        this.renderTableContent();
      });
    });

    // 表格列點擊代理 (支援資料夾下鑽)
    const tbody = this.container.querySelector('#listview-table-body') as HTMLElement;
    tbody.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('tr[data-node-id]') as HTMLElement | null;
      if (!row || !this.rootNode || !this.rootNode.children) return;

      const nodeId = row.getAttribute('data-node-id');
      const clickedNode = this.rootNode.children.find(c => c.id === nodeId);
      if (!clickedNode) return;

      // 如果點擊下鑽按鈕或資料夾列
      if (clickedNode.isDirectory && this.onNodeClick) {
        this.onNodeClick(clickedNode);
      }
    });
  }

  /**
   * 更新表頭排序圖示
   */
  private updateHeaderSortIcons(): void {
    const sortHeaders = this.container.querySelectorAll('th.sortable');
    sortHeaders.forEach(th => {
      const col = th.getAttribute('data-col');
      const icon = th.querySelector('.sort-icon') as HTMLElement;
      if (!icon) return;

      if (col === this.currentSortCol) {
        icon.className = `sort-icon active ${this.currentSortDir}`;
        icon.textContent = this.currentSortDir === 'asc' ? '▲' : '▼';
      } else {
        icon.className = 'sort-icon';
        icon.textContent = '';
      }
    });
  }

  /**
   * 渲染表格資料列
   */
  private renderTableContent(): void {
    if (!this.rootNode) return;

    const tbody = this.container.querySelector('#listview-table-body') as HTMLElement;
    const emptyState = this.container.querySelector('#listview-empty-state') as HTMLElement;
    const countEl = this.container.querySelector('.listview-items-count') as HTMLElement;
    const sizeEl = this.container.querySelector('.listview-size-sum') as HTMLElement;

    if (!this.rootNode.children || this.rootNode.children.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'flex';
      countEl.textContent = '0 個項目';
      sizeEl.textContent = formatBytes(this.rootNode.sizeBytes);
      return;
    }

    // 1. 篩選
    let items = this.rootNode.children;
    if (this.filterQuery) {
      items = items.filter(item => 
        item.name.toLowerCase().includes(this.filterQuery) ||
        (item.extension && item.extension.toLowerCase().includes(this.filterQuery))
      );
    }

    // 當前目錄總大小 (用於計算佔比)
    const currentTotalBytes = Math.max(1, this.rootNode.children.reduce((acc, c) => acc + c.sizeBytes, 0));

    // 2. 排序
    items = [...items].sort((a, b) => {
      let comparison = 0;
      switch (this.currentSortCol) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'size':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
        case 'percent':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
        case 'type': {
          const typeA = this.getItemTypeLabel(a);
          const typeB = this.getItemTypeLabel(b);
          comparison = typeA.localeCompare(typeB);
          break;
        }
      }
      return this.currentSortDir === 'asc' ? comparison : -comparison;
    });

    // 3. 更新頂部統計數據
    const filteredTotalBytes = items.reduce((acc, c) => acc + c.sizeBytes, 0);
    countEl.textContent = `${items.length} 個項目${this.filterQuery ? ` (篩選自 ${this.rootNode.children.length} 項)` : ''}`;
    sizeEl.textContent = formatBytes(filteredTotalBytes);

    if (items.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'flex';
      const emptyTitle = emptyState.querySelector('.empty-title') as HTMLElement;
      if (emptyTitle) emptyTitle.textContent = '沒有符合搜尋條件的項目';
      return;
    }

    emptyState.style.display = 'none';

    // 4. 高效 DOM 片段生成
    const fragment = document.createDocumentFragment();

    for (const item of items) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-node-id', item.id);
      tr.className = `listview-row ${item.isDirectory ? 'is-directory' : 'is-file'}`;

      const percent = Math.min(100, Math.max(0, (item.sizeBytes / currentTotalBytes) * 100));
      const percentStr = percent >= 0.1 ? `${percent.toFixed(1)}%` : (percent > 0 ? '< 0.1%' : '0%');
      const iconInfo = this.getItemIcon(item);
      const typeLabel = this.getItemTypeLabel(item);

      tr.innerHTML = `
        <td class="col-name">
          <div class="name-cell">
            <span class="item-icon ${iconInfo.className}">${iconInfo.icon}</span>
            <div class="name-details">
              <span class="item-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</span>
              ${item.isReparsePoint ? '<span class="badge-junction">Junction</span>' : ''}
            </div>
          </div>
        </td>
        <td class="col-size">
          <div class="size-cell">
            <span class="size-text">${formatBytes(item.sizeBytes)}</span>
          </div>
        </td>
        <td class="col-percent">
          <div class="percent-cell">
            <div class="percent-bar-track">
              <div class="percent-bar-fill ${iconInfo.barClass}" style="width: ${Math.max(1, percent)}%;"></div>
            </div>
            <span class="percent-text">${percentStr}</span>
          </div>
        </td>
        <td class="col-type">
          <span class="type-tag ${iconInfo.tagClass}">${typeLabel}</span>
        </td>
        <td class="col-action">
          ${item.isDirectory ? `
            <button class="btn-drill-down" title="深入瀏覽此資料夾">
              <span>下鑽</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          ` : `
            <span class="file-dim-action">—</span>
          `}
        </td>
      `;

      fragment.appendChild(tr);
    }

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  /**
   * 根據副檔名與類型決定圖示與色彩主題標籤
   */
  private getItemIcon(item: MftRecordSummary): { icon: string; className: string; tagClass: string; barClass: string } {
    if (item.isReparsePoint) {
      return {
        icon: '⚡',
        className: 'icon-junction',
        tagClass: 'tag-junction',
        barClass: 'bar-junction'
      };
    }

    if (item.isDirectory) {
      return {
        icon: '📁',
        className: 'icon-folder',
        tagClass: 'tag-folder',
        barClass: 'bar-folder'
      };
    }

    const ext = (item.extension || '').toLowerCase().replace(/^\./, '');
    
    // 影音多媒體
    if (['mp4', 'mkv', 'mov', 'avi', 'mp3', 'flac', 'jpg', 'png', 'webp', 'svg', 'gif'].includes(ext)) {
      return { icon: '🎬', className: 'icon-media', tagClass: 'tag-media', barClass: 'bar-media' };
    }
    // 程式碼與開發
    if (['ts', 'js', 'mjs', 'rs', 'py', 'json', 'html', 'css', 'sql', 'toml', 'yaml', 'c', 'cpp'].includes(ext)) {
      return { icon: '💻', className: 'icon-code', tagClass: 'tag-code', barClass: 'bar-code' };
    }
    // 執行檔與二進位
    if (['exe', 'dll', 'sys', 'rlib', 'bin', 'msi', 'com'].includes(ext)) {
      return { icon: '⚙️', className: 'icon-binary', tagClass: 'tag-binary', barClass: 'bar-binary' };
    }
    // 壓縮檔與映像
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'vhd'].includes(ext)) {
      return { icon: '🗜️', className: 'icon-archive', tagClass: 'tag-archive', barClass: 'bar-archive' };
    }
    // 文件與文字
    if (['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'doc', 'xls'].includes(ext)) {
      return { icon: '📄', className: 'icon-doc', tagClass: 'tag-doc', barClass: 'bar-doc' };
    }

    return { icon: '📦', className: 'icon-other', tagClass: 'tag-other', barClass: 'bar-other' };
  }

  /**
   * 取得人類可讀的類型標籤
   */
  private getItemTypeLabel(item: MftRecordSummary): string {
    if (item.isReparsePoint) return '符號連結 / 接合點';
    if (item.isDirectory) {
      const count = item.children ? item.children.length : 0;
      return `資料夾 (${count})`;
    }
    const ext = (item.extension || '').toUpperCase();
    return ext ? `${ext} 檔案` : '未知檔案';
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
