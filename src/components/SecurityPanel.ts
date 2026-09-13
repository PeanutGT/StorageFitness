/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：核心安全白名單與防護狀態面板 (src/components/SecurityPanel.ts)
 */

export class SecurityPanelComponent {
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
          <h2 style="font-size: 1.6rem; font-weight: 800; background: linear-gradient(135deg, #fff, #00f5a0); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">系統防禦與核心白名單</h2>
          <p style="color: var(--text-secondary); font-size: 0.92rem; margin-top: 4px;">多層安全防禦網已全面啟動，杜絕任何誤刪系統檔案或循環連結攻擊的風險</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 32px;">
          <div style="
            background: var(--bg-surface-elevated);
            border: 1px solid rgba(0, 245, 160, 0.3);
            border-radius: var(--radius-lg);
            padding: 20px;
            display: flex;
            gap: 16px;
          ">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: rgba(0, 245, 160, 0.12);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; stroke: var(--accent-emerald); stroke-width: 2; fill: none;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem;">絕對保護白名單 (Hard Whitelist)</div>
              <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
                硬編碼阻斷 System32、WinSxS、虛擬分頁檔及引導區，任何 API 皆無法對其發起刪除指令。
              </div>
              <div style="margin-top: 8px; font-size: 0.76rem; color: var(--accent-emerald); font-weight: 600;">● 永久常駐保護中</div>
            </div>
          </div>

          <div style="
            background: var(--bg-surface-elevated);
            border: 1px solid rgba(0, 242, 254, 0.3);
            border-radius: var(--radius-lg);
            padding: 20px;
            display: flex;
            gap: 16px;
          ">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: var(--radius-md);
              background: rgba(0, 242, 254, 0.12);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; stroke: var(--accent-cyan); stroke-width: 2; fill: none;">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <div>
              <div style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem;">Reparse Point 攔截防線</div>
              <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
                精準辨識 Junction / Symlink 符號連結，強制阻斷遞迴遍歷，徹底防範無窮迴圈與軟體炸彈。
              </div>
              <div style="margin-top: 8px; font-size: 0.76rem; color: var(--accent-cyan); font-weight: 600;">● 0x0400 屬性即時過濾</div>
            </div>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 24px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 14px;">核心受保護路徑清單 (靜態審計)</h3>
          <div style="display: flex; flex-direction: column; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;">
            <div style="padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); color: var(--accent-emerald);">
              🛡️ C:\\Windows\\System32\\* (核心系統二進位檔與 DLL)
            </div>
            <div style="padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); color: var(--accent-emerald);">
              🛡️ C:\\Windows\\WinSxS\\* (Windows 元件存放庫)
            </div>
            <div style="padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); color: var(--accent-emerald);">
              🛡️ C:\\pagefile.sys, C:\\swapfile.sys (虛擬記憶體交換檔)
            </div>
            <div style="padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); color: var(--accent-emerald);">
              🛡️ C:\\hiberfil.sys (休眠映像檔)
            </div>
            <div style="padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); color: var(--accent-emerald);">
              🛡️ C:\\Boot\\*, C:\\EFI\\* (系統引導與韌體管理分割區)
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
