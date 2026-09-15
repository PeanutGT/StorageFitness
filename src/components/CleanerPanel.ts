/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：智慧清理規則與掃描面板 (src/components/CleanerPanel.ts)
 */

import type { CleanupRule, MftRecordSummary } from '../shared/ipc-contracts';
import { formatBytes, updateCleanupRules, analyzeCleanupTargets, executeCleanup } from '../services/ipc';

export const DEFAULT_CLEANUP_RULES: CleanupRule[] = [
  {
    ruleId: 'dev-node-modules',
    name: 'Node.js 專案依賴 (node_modules)',
    description: '專案中未使用的巨大依賴庫，可隨時透過 npm/pnpm install 重新安裝',
    targetPattern: '**/node_modules',
    riskLevel: 'SAFE',
    estimatedSize: 8520000000,
    defaultSelected: true,
  },
  {
    ruleId: 'dev-rust-target',
    name: 'Rust 建置產物 (target)',
    description: 'Cargo 編譯產生的中介檔與肥大 rlib 檔案',
    targetPattern: '**/target/debug',
    riskLevel: 'SAFE',
    estimatedSize: 4890000000,
    defaultSelected: true,
  },
  {
    ruleId: 'sys-user-temp',
    name: 'Windows 使用者暫存檔案 (%TEMP%)',
    description: '應用程式遺留的臨時工作檔案與未清理日誌',
    targetPattern: '%TEMP%/*',
    riskLevel: 'SAFE',
    estimatedSize: 2350000000,
    defaultSelected: true,
  },
  {
    ruleId: 'browser-caches',
    name: '瀏覽器快取 (Chrome / Edge)',
    description: '網頁預載暫存檔與多媒體快取，清理後首次載入網頁可能微慢',
    targetPattern: '**/User Data/Default/Cache',
    riskLevel: 'SAFE',
    estimatedSize: 1820000000,
    defaultSelected: false,
  },
  {
    ruleId: 'sys-crash-dumps',
    name: 'Windows 系統崩潰轉儲檔 (Crash Dumps)',
    description: '藍屏或程式崩潰產生的 .dmp 診斷紀錄',
    targetPattern: 'C:\\Windows\\Minidump\\*.dmp',
    riskLevel: 'QUARANTINE',
    estimatedSize: 640000000,
    defaultSelected: false,
  }
];

export class CleanerPanelComponent {
  private container: HTMLElement;
  private rules: CleanupRule[] = DEFAULT_CLEANUP_RULES;
  private selectedRuleIds: Set<string> = new Set();
  private excludedPaths: Set<string> = new Set(); // 記錄使用者在詳細預覽中取消勾選的具體路徑
  private matchedPaths: Record<string, string[]> = {};
  private isUpdating: boolean = false;
  private isAnalyzing: boolean = false;
  private expandedCategories: Set<string> = new Set(['Dev & Design', 'Gaming', 'System', 'Browsers & Apps', 'Other', '未分類 (Other)']);

  constructor(container: HTMLElement) {
    this.container = container;
    this.rules.filter(r => r.defaultSelected).forEach(r => this.selectedRuleIds.add(r.ruleId));
    this.render();
  }

  public async fetchRules(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;
    this.render();
    try {
      const newRules = await updateCleanupRules();
      this.rules = newRules;
      this.selectedRuleIds.clear();
      this.rules.filter(r => r.defaultSelected).forEach(r => this.selectedRuleIds.add(r.ruleId));
    } catch (e) {
      console.error('Failed to fetch rules:', e);
      alert('無法取得雲端規則，請檢查網路連線。');
    } finally {
      this.isUpdating = false;
      this.render();
    }
  }

  public async analyze(tree: MftRecordSummary): Promise<void> {
    if (this.isAnalyzing) return;
    this.isAnalyzing = true;
    this.render();
    try {
      const result = await analyzeCleanupTargets(tree, this.rules);
      this.rules = result.rules;
      this.matchedPaths = result.matchedPaths;
    } catch (e) {
      console.error('Failed to analyze rules:', e);
    } finally {
      this.isAnalyzing = false;
      this.render();
    }
  }

  public show(): void {
    this.container.style.display = 'block';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private getTotalSelectedSize(): number {
    return this.rules
      .filter(r => this.selectedRuleIds.has(r.ruleId))
      .reduce((acc, r) => acc + (r.estimatedSize || 0), 0);
  }

  public render(): void {
    const totalSize = this.getTotalSelectedSize();

    // 進行分類群組化
    const categorizedRules: Record<string, CleanupRule[]> = {};
    this.rules.forEach(r => {
      const cat = r.category || '未分類 (Other)';
      if (!categorizedRules[cat]) categorizedRules[cat] = [];
      categorizedRules[cat].push(r);
    });

    let rulesHtml = '';
    for (const [category, catRules] of Object.entries(categorizedRules)) {
      const isExpanded = this.expandedCategories.has(category);
      rulesHtml += `
        <div style="margin-bottom: 24px;">
          <div class="category-header" data-category="${category}" style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 16px; background: rgba(255,255,255,0.03); 
            border-radius: var(--radius-sm); cursor: pointer; margin-bottom: 12px;
            border-left: 3px solid var(--accent-cyan);
          ">
            <span style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${category} <span style="color: var(--text-muted); font-size: 0.9rem;">(${catRules.length})</span></span>
            <span style="color: var(--text-muted); transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;">▼</span>
          </div>
          <div style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 14px; padding-left: 12px;">
            ${catRules.map(rule => `
              <div style="
                background: var(--bg-surface-elevated);
                border: 1px solid ${this.selectedRuleIds.has(rule.ruleId) ? 'var(--border-glass-active)' : 'var(--border-glass)'};
                border-radius: var(--radius-md);
                padding: 18px 22px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                transition: all var(--transition-fast);
                box-shadow: ${this.selectedRuleIds.has(rule.ruleId) ? 'inset 0 0 12px rgba(0, 242, 254, 0.08)' : 'none'};
              " class="rule-card" data-rule-id="${rule.ruleId}">
                <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
                  <input type="checkbox" ${this.selectedRuleIds.has(rule.ruleId) ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-cyan); cursor: pointer;" />
                  <div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span style="font-weight: 700; color: var(--text-primary); font-size: 1rem;">${rule.name}</span>
                      <span style="
                        font-size: 0.7rem;
                        font-weight: 700;
                        padding: 2px 8px;
                        border-radius: var(--radius-full);
                        background: ${rule.riskLevel === 'SAFE' ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 183, 3, 0.15)'};
                        color: ${rule.riskLevel === 'SAFE' ? 'var(--accent-emerald)' : 'var(--accent-amber)'};
                        border: 1px solid ${rule.riskLevel === 'SAFE' ? 'rgba(0, 245, 160, 0.3)' : 'rgba(255, 183, 3, 0.3)'};
                      ">${rule.riskLevel}</span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 0.84rem; margin-top: 4px;">${rule.description}</div>
                    <div style="color: var(--text-muted); font-size: 0.74rem; font-family: 'JetBrains Mono', monospace; margin-top: 2px;">匹配規則: ${rule.targetPattern}</div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 20px;">
                  <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">
                    ${formatBytes(rule.estimatedSize || 0)}
                  </div>
                  <button class="btn-inspect" data-rule-id="${rule.ruleId}" style="
                    background: transparent; border: 1px solid var(--border-glass); 
                    color: var(--accent-cyan); padding: 6px 10px; border-radius: var(--radius-sm);
                    cursor: pointer; font-size: 0.85rem; transition: background 0.2s;
                  ">🔍 預覽</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto; position: relative;" id="cleaner-scroll-container">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px;">
          <div>
            <h2 style="font-size: 1.6rem; font-weight: 800; background: linear-gradient(135deg, #fff, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">智慧瘦身清理</h2>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px;">
              <p style="color: var(--text-secondary); font-size: 0.92rem; margin: 0;">由雲端規則引擎推薦的高價值安全清理目標</p>
              <button id="btn-ota-update" ${this.isUpdating ? 'disabled' : ''} style="
                background: var(--bg-surface);
                border: 1px solid var(--border-glass);
                color: var(--accent-cyan);
                padding: 4px 12px;
                border-radius: var(--radius-sm);
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                transition: all var(--transition-fast);
              ">${this.isUpdating ? '更新中...' : '⟳ OTA 更新'}</button>
              <button id="btn-add-custom" style="
                background: rgba(0, 242, 254, 0.1);
                border: 1px solid var(--accent-cyan);
                color: var(--accent-cyan);
                padding: 4px 12px;
                border-radius: var(--radius-sm);
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                transition: all var(--transition-fast);
              ">➕ 新增自訂規則</button>
            </div>
            ${this.isAnalyzing ? '<div style="color: var(--accent-amber); font-size: 0.85rem; margin-top: 8px;">⏳ 正在分析磁碟佔用，請稍候...</div>' : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-muted);">已選取預估釋放空間</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent-cyan); font-family: 'JetBrains Mono', monospace;">
              ${formatBytes(totalSize)}
            </div>
          </div>
        </div>

        ${rulesHtml}

        <div style="display: flex; justify-content: flex-end; gap: 16px; margin-top: 24px; margin-bottom: 40px;">
          <button id="btn-select-all" style="
            background: var(--bg-surface);
            border: 1px solid var(--border-glass);
            color: var(--text-secondary);
            padding: 12px 20px;
            border-radius: var(--radius-md);
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition-fast);
          ">全選 / 取消全選</button>

          <button id="btn-clean-now" style="
            background: linear-gradient(135deg, var(--accent-pink), var(--accent-purple));
            color: #ffffff;
            border: none;
            padding: 12px 28px;
            border-radius: var(--radius-md);
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            box-shadow: var(--shadow-neon-pink);
            transition: all var(--transition-smooth);
          ">開始安全清理 (移至資源回收筒)</button>
        </div>
        
        <!-- Modal Container for Preview -->
        <div id="preview-modal-container" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 100; align-items: center; justify-content: center;"></div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    // Category Expand/Collapse
    this.container.querySelectorAll('.category-header').forEach(header => {
      header.addEventListener('click', () => {
        const cat = header.getAttribute('data-category');
        if (cat) {
          if (this.expandedCategories.has(cat)) this.expandedCategories.delete(cat);
          else this.expandedCategories.add(cat);
          this.render();
        }
      });
    });

    // Rule Card Toggle
    this.container.querySelectorAll('.rule-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent toggle if clicking Inspect button or checkbox directly
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.classList.contains('btn-inspect')) return;
        
        const ruleId = card.getAttribute('data-rule-id');
        if (!ruleId) return;

        if (this.selectedRuleIds.has(ruleId)) {
          this.selectedRuleIds.delete(ruleId);
        } else {
          this.selectedRuleIds.add(ruleId);
        }
        this.render();
      });
    });

    // Inspect Button
    this.container.querySelectorAll('.btn-inspect').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleId = btn.getAttribute('data-rule-id');
        if (ruleId) this.showPreviewModal(ruleId);
      });
    });

    // Add Custom Rule
    const addCustomBtn = this.container.querySelector('#btn-add-custom');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', () => {
        alert("此功能即將與 Rust 後端整合！(UI 預留)");
      });
    }

    // OTA Update
    const otaBtn = this.container.querySelector('#btn-ota-update');
    if (otaBtn) {
      otaBtn.addEventListener('click', () => {
        this.fetchRules();
      });
    }

    // Select All
    const selectAllBtn = this.container.querySelector('#btn-select-all');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        if (this.selectedRuleIds.size === this.rules.length) {
          this.selectedRuleIds.clear();
        } else {
          this.rules.forEach(r => this.selectedRuleIds.add(r.ruleId));
        }
        this.render();
      });
    }

    // Clean Now
    const cleanNowBtn = this.container.querySelector('#btn-clean-now');
    if (cleanNowBtn) {
      cleanNowBtn.addEventListener('click', async () => {
        const pathsToClean: string[] = [];
        for (const ruleId of this.selectedRuleIds) {
          const paths = this.matchedPaths[ruleId] || [];
          paths.forEach(p => {
            if (!this.excludedPaths.has(p)) {
              pathsToClean.push(p);
            }
          });
        }

        if (pathsToClean.length === 0) {
          alert('沒有選取任何可清理的目標檔案！請先確認掃描結果。');
          return;
        }

        const confirmMsg = `即將把 ${pathsToClean.length} 個項目移至資源回收筒\n預估釋放: ${formatBytes(this.getTotalSelectedSize())}\n\n是否繼續？`;
        if (confirm(confirmMsg)) {
          try {
            await executeCleanup(pathsToClean);
            this.showWorkoutCompleteAnimation(this.getTotalSelectedSize());
          } catch (e) {
            console.error('Cleanup failed:', e);
            alert(`清理失敗：${e}`);
          }
        }
      });
    }
  }

  private showPreviewModal(ruleId: string) {
    const modalContainer = this.container.querySelector('#preview-modal-container') as HTMLElement;
    if (!modalContainer) return;

    const paths = this.matchedPaths[ruleId] || [];
    const rule = this.rules.find(r => r.ruleId === ruleId);
    
    let pathListHtml = '';
    if (paths.length === 0) {
      pathListHtml = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">此規則尚未匹配到任何檔案。</div>';
    } else {
      pathListHtml = paths.map(p => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border-glass);">
          <input type="checkbox" class="exclude-checkbox" data-path="${p}" ${!this.excludedPaths.has(p) ? 'checked' : ''} style="accent-color: var(--accent-cyan); width: 16px; height: 16px;" />
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-secondary); word-break: break-all;">${p}</span>
        </div>
      `).join('');
    }

    modalContainer.innerHTML = `
      <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); width: 80%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: var(--text-primary); font-size: 1.2rem;">詳細檢視: ${rule?.name || ruleId}</h3>
          <button id="btn-close-modal" style="background: transparent; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>
        <div style="padding: 12px 24px; background: rgba(0,0,0,0.2); font-size: 0.85rem; color: var(--accent-amber);">
          💡 提示：取消勾選即可將特定檔案從本次清理中排除 (單次有效)。
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 10px 24px 20px 24px;" id="modal-path-list">
          ${pathListHtml}
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid var(--border-glass); display: flex; justify-content: flex-end;">
          <button id="btn-modal-done" style="background: var(--accent-cyan); color: #000; font-weight: 700; padding: 8px 24px; border: none; border-radius: var(--radius-sm); cursor: pointer;">完成</button>
        </div>
      </div>
    `;

    modalContainer.style.display = 'flex';

    // Bind events in modal
    modalContainer.querySelector('#btn-close-modal')?.addEventListener('click', () => {
      modalContainer.style.display = 'none';
    });
    modalContainer.querySelector('#btn-modal-done')?.addEventListener('click', () => {
      modalContainer.style.display = 'none';
      // The excludedPaths are already updated instantly by the checkboxes, but we can re-render to make sure size reflects if we implemented exact size deduction.
      // (Currently estimatedSize is per rule, but in the future we can subtract excluded sizes).
      this.render();
      // Need to re-open the modal container display block since render wipes it.
      // Wait, render() replaces innerHTML, so the modal is destroyed and recreated hidden. That's perfect.
    });

    modalContainer.querySelectorAll('.exclude-checkbox').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const p = target.getAttribute('data-path');
        if (!p) return;
        if (target.checked) {
          this.excludedPaths.delete(p);
        } else {
          this.excludedPaths.add(p);
        }
      });
    });
  }

  private showWorkoutCompleteAnimation(clearedSize: number) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(10, 10, 15, 0.95)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.5s ease-in-out';
    
    overlay.innerHTML = `
      <div style="text-align: center; transform: scale(0.8); transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);" id="workout-content">
        <h1 style="
          font-size: 5rem; 
          font-weight: 900; 
          margin: 0; 
          background: linear-gradient(135deg, #00f2fe, #4facfe, #00f2fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
          letter-spacing: 4px;
          text-shadow: 0 0 40px rgba(0, 242, 254, 0.4);
        ">Workout Complete!</h1>
        <p style="color: var(--text-secondary); font-size: 1.5rem; margin-top: 10px;">硬碟成功減去了沉重的脂肪</p>
        <div style="
          font-size: 4rem; 
          font-weight: 800; 
          color: #fff; 
          font-family: 'JetBrains Mono', monospace; 
          margin-top: 30px;
          background: rgba(0, 242, 254, 0.1);
          padding: 20px 40px;
          border-radius: var(--radius-lg);
          border: 1px solid rgba(0, 242, 254, 0.3);
          box-shadow: inset 0 0 20px rgba(0, 242, 254, 0.2);
        ">
          -${formatBytes(clearedSize)}
        </div>
        <button id="btn-workout-close" style="
          margin-top: 50px;
          background: transparent;
          border: 2px solid var(--accent-cyan);
          color: var(--accent-cyan);
          padding: 12px 36px;
          border-radius: var(--radius-full);
          font-size: 1.2rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
        ">繼續保持 (Continue)</button>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      const content = overlay.querySelector('#workout-content') as HTMLElement;
      if (content) content.style.transform = 'scale(1)';
    });

    const closeBtn = overlay.querySelector('#btn-workout-close');
    closeBtn?.addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(overlay);
        // Refresh UI
        this.selectedRuleIds.clear();
        this.excludedPaths.clear();
        this.render();
      }, 500);
    });

    closeBtn?.addEventListener('mouseover', () => {
      (closeBtn as HTMLElement).style.background = 'var(--accent-cyan)';
      (closeBtn as HTMLElement).style.color = '#000';
    });
    closeBtn?.addEventListener('mouseout', () => {
      (closeBtn as HTMLElement).style.background = 'transparent';
      (closeBtn as HTMLElement).style.color = 'var(--accent-cyan)';
    });
  }
}
