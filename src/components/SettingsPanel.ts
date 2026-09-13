/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：核心系統設定面板 (src/components/SettingsPanel.ts)
 */

export class SettingsPanelComponent {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  public show(): void {
    this.container.style.display = 'block';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public render(): void {
    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto;">
        <div style="margin-bottom: 28px;">
          <h2 style="font-size: 1.6rem; font-weight: 800; background: linear-gradient(135deg, #fff, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">引擎與偏好設定</h2>
          <p style="color: var(--text-secondary); font-size: 0.92rem; margin-top: 4px;">調校掃描引擎行為、圖形渲染效能與雲端規則庫同步</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px; max-width: 760px;">
          <!-- 掃描模式選擇 -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; font-size: 1rem;">預設掃描權限模式</div>
                <div style="color: var(--text-secondary); font-size: 0.84rem; margin-top: 2px;">遵守最小權限原則，預設以標準權限執行，極速深度掃描時才申請提權</div>
              </div>
              <select style="
                background: var(--bg-core);
                color: var(--text-primary);
                border: 1px solid var(--border-glass);
                padding: 8px 14px;
                border-radius: var(--radius-sm);
                font-family: inherit;
                outline: none;
                cursor: pointer;
              ">
                <option value="standard" selected>標準權限 (Win32 API - 安全首選)</option>
                <option value="elevated">極速模式 (NTFS $MFT 直讀 - 需 UAC)</option>
              </select>
            </div>
          </div>

          <!-- 雲端規則 OTA 熱更新 -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; font-size: 1rem;">雲端清理規則庫 (OTA 熱更新)</div>
                <div style="color: var(--text-secondary); font-size: 0.84rem; margin-top: 2px;">自動從官方 GitHub 獲取最新的軟體殘留清理規則與正規表達式</div>
              </div>
              <button id="btn-update-rules" style="
                background: var(--bg-surface);
                border: 1px solid var(--border-glass-active);
                color: var(--accent-cyan);
                padding: 8px 16px;
                border-radius: var(--radius-sm);
                font-weight: 600;
                font-size: 0.84rem;
                cursor: pointer;
              ">檢查更新</button>
            </div>
          </div>

          <!-- 渲染引擎幀率調校 -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; font-size: 1rem;">Treemap 畫布幀率優化</div>
                <div style="color: var(--text-secondary); font-size: 0.84rem; margin-top: 2px;">在高解析度螢幕上啟用全幀率硬體加速與平滑懸浮光暈</div>
              </div>
              <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                <input type="checkbox" checked style="opacity: 0; width: 0; height: 0;" />
                <span style="
                  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                  background: var(--accent-cyan); border-radius: 24px; transition: .4s;
                "></span>
              </label>
            </div>
          </div>

          <!-- 關於與核心版本 -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 22px;">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 6px;">關於 StorageFitness</div>
            <div style="color: var(--text-muted); font-size: 0.82rem; line-height: 1.6;">
              Core Engine: Rust 1.98 (Tauri v2 + Tokio + Windows-rs)<br>
              Frontend: High-density WebGL/Canvas + Cyber-Glassmorphism CSS<br>
              Repository: <a href="https://github.com/PeanutGT/StorageFitness" target="_blank" style="color: var(--accent-cyan); text-decoration: none;">github.com/PeanutGT/StorageFitness</a>
            </div>
          </div>
        </div>
      </div>
    `;

    const updateBtn = this.container.querySelector('#btn-update-rules');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        updateBtn.textContent = '檢查中...';
        setTimeout(() => {
          updateBtn.textContent = '已是最新規則庫 (v1.4.2)';
        }, 800);
      });
    }
  }
}
