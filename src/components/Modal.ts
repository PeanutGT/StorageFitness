/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：Cyber-Glassmorphism 提示視窗與彈窗元件 (src/components/Modal.ts)
 * 說明：零外部依賴、純 DOM API 封裝之高質感對話框與 UAC 權限警示視窗。
 */

export interface ElevationModalOptions {
  title?: string;
  message?: string;
  driveLetter?: string;
  onConfirm?: () => void;
}

/**
 * 彈出優雅的 UAC 管理員權限提權提示對話框
 */
export function showElevationModal(options: ElevationModalOptions = {}): void {
  const existingModal = document.getElementById('elevation-modal-backdrop');
  if (existingModal) {
    existingModal.remove();
  }

  const drive = (options.driveLetter || 'C').toUpperCase();
  const title = options.title || '需要系統管理員權限';
  const message = options.message || `極速深度掃描引擎需要直接讀取 NTFS 磁碟 (\\\\.\\${drive}:) 的 $MFT 二進位結構，此操作需要 Windows 管理員 (Administrator) 權限。<br/><br/><strong>請以「系統管理員身分」重新執行 StorageFitness 以啟用極速掃描。</strong>`;

  const backdrop = document.createElement('div');
  backdrop.id = 'elevation-modal-backdrop';
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-glow"></div>
      
      <div class="modal-header">
        <div class="uac-modal-shield-badge">
          <svg class="uac-shield-svg" viewBox="0 0 24 24">
            <path class="shield-outline" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <!-- Windows UAC 經典四象限微盾圖騰 -->
            <path class="shield-q1" d="M12 3.2L18.5 6v6c0 4.2-4.5 7.6-6.5 8.7V12H12z" fill="#00a4ef"/>
            <path class="shield-q2" d="M5.5 6L12 3.2V12H5.5V6z" fill="#ffb900"/>
            <path class="shield-q3" d="M5.5 12H12v8.7C10 19.6 5.5 16.2 5.5 12z" fill="#7fba00"/>
            <path class="shield-q4" d="M12 12h6.5c0 4.2-4.5 7.6-6.5 8.7V12z" fill="#f25022"/>
          </svg>
        </div>
        <div class="modal-title-group">
          <h3 id="modal-title" class="modal-title">${title}</h3>
          <span class="modal-subtitle">Windows UAC Privilege Elevation Required</span>
        </div>
        <button class="modal-close-btn" id="modal-close-x" aria-label="關閉">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="modal-message">
          ${message}
        </div>

        <div class="modal-tech-specs">
          <div class="tech-spec-item">
            <span class="tech-spec-label">存取目標</span>
            <span class="tech-spec-value">\\\\.\\${drive}: (Raw NTFS Volume)</span>
          </div>
          <div class="tech-spec-item">
            <span class="tech-spec-label">存取模式</span>
            <span class="tech-spec-value">GENERIC_READ (唯讀無寫入風險)</span>
          </div>
          <div class="tech-spec-item">
            <span class="tech-spec-label">引擎優勢</span>
            <span class="tech-spec-value">繞過 Win32 遍歷，5 秒解析數百萬檔案</span>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-modal-cancel" id="modal-btn-cancel">關閉</button>
        <button class="btn-modal-action" id="modal-btn-confirm">
          <span>我知道了</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // 關閉邏輯
  const closeModal = () => {
    backdrop.classList.add('closing');
    setTimeout(() => {
      backdrop.remove();
      document.removeEventListener('keydown', handleKeyDown);
    }, 200);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // 點擊關閉按鈕與遮罩
  backdrop.querySelector('#modal-close-x')?.addEventListener('click', closeModal);
  backdrop.querySelector('#modal-btn-cancel')?.addEventListener('click', closeModal);
  backdrop.querySelector('#modal-btn-confirm')?.addEventListener('click', () => {
    closeModal();
    if (options.onConfirm) options.onConfirm();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  // 動態觸發滑入動畫
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
  });
}
