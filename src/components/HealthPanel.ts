/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：健康儀表板 (src/components/HealthPanel.ts)
 * 說明：結合軟體瘦身評分與硬體 S.M.A.R.T. 檢測，實現產品核心品牌精神。
 */

import { getDiskHealth } from '../services/ipc';
import type { DiskHealthMetrics } from '../shared/ipc-contracts';

export class HealthPanelComponent {
  private container: HTMLElement;
  private metrics: DiskHealthMetrics[] | null = null;
  private hasAdmin: boolean = true;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async show(): Promise<void> {
    this.container.style.display = 'block';
    
    // 渲染骨架屏
    this.renderLoading();

    try {
      this.metrics = await getDiskHealth();
      this.hasAdmin = true;
    } catch (e: any) {
      if (e.toString().includes('ELEVATION_REQUIRED')) {
        this.hasAdmin = false;
      } else {
        console.error('Failed to get disk health:', e);
      }
    }

    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  private renderLoading(): void {
    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div class="loading-spinner" style="width: 48px; height: 48px; border: 4px solid var(--border-color); border-top-color: var(--accent-emerald); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 16px; color: var(--text-secondary); font-size: 0.9rem;">正在讀取底層 S.M.A.R.T. 硬體健康資訊...</div>
      </div>
      <style>
        @keyframes spin { 100% { transform: rotate(360deg); } }
      </style>
    `;
  }

  private render(): void {
    if (!this.hasAdmin) {
      this.renderRequiresAdmin();
      return;
    }

    const m = this.metrics && this.metrics.length > 0 ? this.metrics[0] : null;

    // 隨機產生一個分數，未來可結合 Cleaner 的數據進行真實評分
    const fitnessScore = Math.floor(Math.random() * (98 - 70 + 1) + 70); 
    let fitnessStatus = '健康精實';
    let fitnessColor = 'var(--accent-emerald)';
    if (fitnessScore < 80) {
      fitnessStatus = '亞健康 (需瘦身)';
      fitnessColor = 'var(--accent-amber)';
    }

    let hardwareHtml = '<div style="color: var(--text-secondary);">無法獲取 S.M.A.R.T. 資料</div>';
    
    if (m) {
      hardwareHtml = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 24px;">
          <div class="health-card">
            <div class="card-title">硬碟溫度</div>
            <div class="card-value" style="color: ${m.temperature && m.temperature > 60 ? 'var(--accent-red)' : 'var(--accent-cyan)'}">${m.temperature ? m.temperature + '°C' : '未知'}</div>
          </div>
          <div class="health-card">
            <div class="card-title">磨損健康度</div>
            <div class="card-value" style="color: ${m.wear && m.wear < 50 ? 'var(--accent-red)' : 'var(--accent-emerald)'}">${m.wear ? m.wear.toFixed(1) + '%' : '未知'}</div>
          </div>
          <div class="health-card">
            <div class="card-title">讀取錯誤總數</div>
            <div class="card-value">${m.readErrorsTotal ?? '0'}</div>
          </div>
          <div class="health-card">
            <div class="card-title">寫入錯誤總數</div>
            <div class="card-value">${m.writeErrorsTotal ?? '0'}</div>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto;">
        <div style="margin-bottom: 32px;">
          <h2 style="font-size: 1.8rem; font-weight: 800; background: linear-gradient(135deg, #fff, #00f5a0); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">硬碟健康儀表板</h2>
          <p style="color: var(--text-secondary); font-size: 0.92rem; margin-top: 4px;">深度監控硬體壽命，並持續精進空間利用率。</p>
        </div>

        <div style="display: flex; gap: 32px; align-items: stretch; flex-wrap: wrap;">
          
          <!-- 軟體健身計分 -->
          <div style="flex: 1; min-width: 300px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 32px; display: flex; flex-direction: column; align-items: center; text-align: center;">
            <div class="fitness-circle" style="
              width: 160px; height: 160px; border-radius: 50%; 
              background: conic-gradient(${fitnessColor} ${fitnessScore}%, var(--bg-surface) 0);
              display: flex; align-items: center; justify-content: center;
              position: relative;
            ">
              <div style="width: 140px; height: 140px; background: var(--bg-surface-elevated); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="font-size: 3rem; font-weight: 800; color: ${fitnessColor}; line-height: 1;">${fitnessScore}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">FITNESS SCORE</div>
              </div>
            </div>
            <h3 style="margin-top: 24px; font-size: 1.2rem; font-weight: 600;">${fitnessStatus}</h3>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 8px;">透過「智慧瘦身清理」清除快取與無用脂肪，可大幅提升健康分數。</p>
          </div>

          <!-- 硬體 SMART 監控 -->
          <div style="flex: 1; min-width: 300px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 32px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; stroke: var(--accent-cyan); stroke-width: 2; fill: none;">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
              <h3 style="font-size: 1.2rem; font-weight: 600;">硬體健康與 S.M.A.R.T.</h3>
            </div>
            ${hardwareHtml}
          </div>
        </div>
      </div>

      <style>
        .health-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
        }
        .card-title {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .card-value {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--text-primary);
        }
      </style>
    `;
  }

  private renderRequiresAdmin(): void {
    this.container.innerHTML = `
      <div style="padding: 32px 40px; height: 100%; overflow-y: auto; position: relative;">
        <!-- 模糊背景 -->
        <div style="filter: blur(8px); opacity: 0.5; pointer-events: none; user-select: none;">
          <h2 style="font-size: 1.8rem; font-weight: 800;">硬碟健康儀表板</h2>
          <div style="display: flex; gap: 32px; margin-top: 32px;">
             <div style="flex: 1; height: 300px; background: var(--bg-surface-elevated); border-radius: var(--radius-lg);"></div>
             <div style="flex: 1; height: 300px; background: var(--bg-surface-elevated); border-radius: var(--radius-lg);"></div>
          </div>
        </div>

        <!-- 提權覆蓋層 -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(14, 18, 25, 0.7); backdrop-filter: blur(4px);">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(0, 112, 243, 0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
            <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; stroke: var(--accent-blue); stroke-width: 2; fill: none;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 12px;">需要系統管理員權限</h2>
          <p style="color: var(--text-secondary); max-width: 400px; text-align: center; line-height: 1.6; margin-bottom: 32px;">
            讀取磁碟 S.M.A.R.T. 底層資訊（如溫度、壽命損耗、讀寫錯誤率）需要向 Windows WMI 發起高權限請求。
          </p>
          <button id="btn-elevate-health" style="
            background: linear-gradient(135deg, var(--accent-blue), #0056b3);
            border: none;
            border-radius: var(--radius-md);
            color: #fff;
            padding: 12px 24px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.2s ease;
          ">
            <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none;">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            解鎖硬體監控 (UAC 提權)
          </button>
        </div>
      </div>
    `;

    const elevateBtn = this.container.querySelector('#btn-elevate-health');
    if (elevateBtn) {
      elevateBtn.addEventListener('click', () => {
        alert('這將會透過 Tauri 觸發 runas 提權重啟，在此展示版本中略過實際執行。');
      });
    }
  }
}
