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
  private matchedPaths: Record<string, string[]> = {};
  private isUpdating: boolean = false;
  private isAnalyzing: boolean = false;

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
      
      console.log('--- 🧹 清理規則分析完成 ---');
      Object.entries(result.matchedPaths).forEach(([ruleId, paths]) => {
        if (paths.length > 0) {
          console.log(`[${ruleId}] 匹配到 ${paths.length} 個目標，前 3 項:`, paths.slice(0, 3));
        }
      });
      console.log('----------------------------');
      
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

    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto;">
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
              ">${this.isUpdating ? '更新中...' : '⟳ OTA 更新規則'}</button>
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

        <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 32px;">
          ${this.rules.map(rule => `
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
              <div style="display: flex; align-items: center; gap: 16px;">
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

              <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">
                ${formatBytes(rule.estimatedSize || 0)}
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 16px;">
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
      </div>
    `;

    // 綁定卡片勾選
    this.container.querySelectorAll('.rule-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
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

    // 綁定 OTA 更新按鈕
    const otaBtn = this.container.querySelector('#btn-ota-update');
    if (otaBtn) {
      otaBtn.addEventListener('click', () => {
        this.fetchRules();
      });
    }

    // 全選切換按鈕
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

    // 清理按鈕
    const cleanBtn = this.container.querySelector('#btn-clean-now');
    if (cleanBtn) {
      cleanBtn.addEventListener('click', async () => {
        let pathsToClean: string[] = [];
        this.selectedRuleIds.forEach(ruleId => {
          if (this.matchedPaths[ruleId]) {
            pathsToClean = pathsToClean.concat(this.matchedPaths[ruleId]);
          }
        });

        if (pathsToClean.length === 0) {
          alert('沒有選取任何可清理的目標檔案！請先勾選規則或確認掃描結果。');
          return;
        }

        const btnElement = cleanBtn as HTMLButtonElement;
        const originalText = btnElement.textContent;
        btnElement.textContent = '清理中...';
        btnElement.disabled = true;

        try {
          await executeCleanup(pathsToClean);
          alert(`✅ 已成功將 ${pathsToClean.length} 個目標移至系統資源回收筒！\n預計釋放 ${formatBytes(totalSize)} 的磁碟空間。`);
          
          // 清理後，清空已選取狀態並通知使用者可以重新掃描
          this.selectedRuleIds.clear();
          this.matchedPaths = {};
          this.render();
        } catch (e: any) {
          console.error(e);
          alert('清理過程中發生錯誤:\n' + (e?.message || e));
        } finally {
          btnElement.disabled = false;
          btnElement.textContent = originalText || '開始安全清理 (移至資源回收筒)';
        }
      });
    }
  }
}
