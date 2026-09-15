/**
 * StorageFitness - Next-Gen Windows Disk Analyzer & Cleaner
 * 負責人：⚡ Gemini 3.8 Flash
 * 模組：高效能 60fps Canvas 互動式 Treemap 渲染引擎 (src/components/visualizations/TreemapEngine.ts)
 * 特色：Squarified 演算法、檔案分類智慧上色、Retina 高解析度支援、流暢縮放與懸浮光效
 */

import type { MftRecordSummary } from '../../shared/ipc-contracts';
import { formatBytes } from '../../services/ipc';
import type { IVisualizationEngine, NodeClickCallback } from './IVisualizationEngine';

export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  node: MftRecordSummary;
  color: string;
}

export { type NodeClickCallback };

export class TreemapEngine implements IVisualizationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tooltipEl: HTMLElement;
  private legendEl?: HTMLElement | null;
  private rects: TreemapRect[] = [];
  private hoveredRect: TreemapRect | null = null;
  private rootNode: MftRecordSummary | null = null;
  private onNodeClick?: NodeClickCallback;
  private isVisible: boolean = true;

  // 類別色彩對應表
  private static readonly COLOR_MAP: Record<string, string> = {
    // 影音多媒體 (Hot Coral / Magenta)
    mp4: '#ff007a', mkv: '#ff007a', mov: '#ff007a', avi: '#ff007a', mp3: '#ff3399', flac: '#ff3399', jpg: '#ff4d94', png: '#ff4d94', webp: '#ff4d94', svg: '#ff4d94',
    // 程式碼與專案 (Electric Cyan)
    ts: '#00d4ff', js: '#00d4ff', mjs: '#00d4ff', rs: '#00f2fe', py: '#00b4d8', json: '#48cae4', html: '#90e0ef', css: '#ade8f4',
    // 執行檔與編譯產物 (Royal Purple)
    exe: '#9d4edd', dll: '#7b2cbf', sys: '#5a189a', rlib: '#c77dff', bin: '#9d4edd', msi: '#7b2cbf',
    // 壓縮檔與映像檔 (Amber Orange)
    zip: '#ff9f1c', rar: '#ffbf69', '7z': '#ff9f1c', tar: '#ffaa00', gz: '#ffb703', iso: '#fb8500',
    // 文件與文字 (Emerald Green)
    pdf: '#00f5a0', docx: '#00e676', xlsx: '#00c853', pptx: '#69f0ae', txt: '#b9f6ca', md: '#00f5a0',
  };

  constructor(canvas: HTMLCanvasElement, tooltipEl: HTMLElement, legendEl?: HTMLElement | null) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;
    this.tooltipEl = tooltipEl;
    this.legendEl = legendEl;

    this.setupEventListeners();
    this.resize();
  }

  public setOnNodeClick(callback: NodeClickCallback): void {
    this.onNodeClick = callback;
  }

  public show(): void {
    this.isVisible = true;
    this.canvas.style.display = 'block';
    if (this.legendEl) {
      this.legendEl.style.display = 'flex';
    }
    // 延遲或立即觸發一次自適應大小與佈局重繪
    requestAnimationFrame(() => {
      this.resize();
    });
  }

  public hide(): void {
    this.isVisible = false;
    this.canvas.style.display = 'none';
    if (this.legendEl) {
      this.legendEl.style.display = 'none';
    }
    this.hideTooltip();
    this.hoveredRect = null;
  }

  public resize(): void {
    if (!this.isVisible) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    // 支援高 DPI 螢幕清晰渲染
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    if (this.rootNode) {
      this.layout(this.rootNode);
    }
  }

  public setRootNode(node: MftRecordSummary): void {
    this.rootNode = node;
    if (this.isVisible) {
      this.layout(node);
    }
  }

  /**
   * 計算並佈局 Treemap 區塊
   */
  private layout(root: MftRecordSummary): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.rects = [];
    if (width <= 0 || height <= 0) return;

    if (!root.children || root.children.length === 0) {
      this.rects.push({
        x: 0, y: 0, w: width, h: height,
        node: root, color: this.getNodeColor(root),
      });
      this.render();
      return;
    }

    // 排序
    const sortedChildren = [...root.children]
      .filter(c => c.sizeBytes > 0)
      .sort((a, b) => b.sizeBytes - a.sizeBytes);

    const totalSize = sortedChildren.reduce((acc, c) => acc + c.sizeBytes, 0);
    if (totalSize === 0) {
      this.render();
      return;
    }

    // 智能聚合 (Smart Aggregation) - 佔比小於 0.5% 的檔案歸類為 Others
    const THRESHOLD = totalSize * 0.005;
    const significantChildren: MftRecordSummary[] = [];
    let othersSize = 0;

    for (const child of sortedChildren) {
      if (child.sizeBytes >= THRESHOLD) {
        significantChildren.push(child);
      } else {
        othersSize += child.sizeBytes;
      }
    }

    if (othersSize > 0) {
      significantChildren.push({
        id: 'virtual-others',
        name: '📦 其他零碎檔案 (Others)',
        path: '',
        sizeBytes: othersSize,
        isDirectory: true,
        isReparsePoint: false,
        depth: root.depth + 1,
      });
    }

    this.squarify(significantChildren, 0, 0, width, height, totalSize);
    this.render();
  }

  /**
   * 經典 Squarified Treemap 演算法實作
   */
  private squarify(
    children: MftRecordSummary[],
    x: number,
    y: number,
    w: number,
    h: number,
    totalArea: number
  ): void {
    if (children.length === 0 || w <= 0 || h <= 0) return;

    let currentX = x;
    let currentY = y;
    let currentW = w;
    let currentH = h;
    let remainingArea = totalArea;

    for (const child of children) {
      if (remainingArea <= 0) break;
      const ratio = child.sizeBytes / remainingArea;
      const isHorizontal = currentW >= currentH;

      if (isHorizontal) {
        const itemW = Math.max(1, currentW * ratio);
        this.rects.push({
          x: currentX,
          y: currentY,
          w: itemW,
          h: currentH,
          node: child,
          color: this.getNodeColor(child),
        });
        currentX += itemW;
        currentW -= itemW;
      } else {
        const itemH = Math.max(1, currentH * ratio);
        this.rects.push({
          x: currentX,
          y: currentY,
          w: currentW,
          h: itemH,
          node: child,
          color: this.getNodeColor(child),
        });
        currentY += itemH;
        currentH -= itemH;
      }
      remainingArea -= child.sizeBytes;
    }
  }

  /**
   * 取得節點視覺色碼
   */
  private getHashHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }

  private getNodeColor(node: MftRecordSummary): string {
    if (node.id === 'virtual-others') {
      return 'rgba(40, 45, 60, 0.9)'; // Others 用深灰色
    }
    if (node.isReparsePoint) {
      return '#ffb703';
    }
    if (node.isDirectory) {
      const hue = this.getHashHue(node.name);
      return `hsl(${hue}, 65%, 28%)`; // 資料夾顏色
    }

    const ext = (node.extension || '').toLowerCase().replace(/^\./, '');
    if (TreemapEngine.COLOR_MAP[ext]) {
      return TreemapEngine.COLOR_MAP[ext];
    }
    
    // 預設檔案使用和名稱相關的 HSL 色，但較亮
    const hue = this.getHashHue(node.name);
    return `hsl(${hue}, 40%, 45%)`;
  }

  /**
   * 核心 Canvas 渲染 (60fps)
   */
  private render(): void {
    if (!this.isVisible) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // 漸層背景清屏
    const bgGradient = this.ctx.createLinearGradient(0, 0, w, h);
    bgGradient.addColorStop(0, '#090b14');
    bgGradient.addColorStop(1, '#111528');
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, w, h);

    // 繪製每個磁區方塊
    for (const r of this.rects) {
      const isHovered = this.hoveredRect === r;

      // 填充底色
      this.ctx.fillStyle = r.color;
      this.ctx.fillRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));

      // 懸停光暈效果
      if (isHovered) {
        this.ctx.strokeStyle = '#00f2fe';
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
      } else {
        // 微弱毛玻璃晶格線
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }

      // 如果方塊足夠大，渲染文字標籤
      if (r.w > 65 && r.h > 35) {
        this.renderBlockLabel(r);
      }
    }
  }

  /**
   * 在區塊內繪製名稱與檔案大小標籤
   */
  private renderBlockLabel(r: TreemapRect): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    this.ctx.clip();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '600 12px "Outfit", sans-serif';
    this.ctx.fillText(r.node.name, r.x + 8, r.y + 18);

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    this.ctx.font = '500 11px "JetBrains Mono", monospace';
    this.ctx.fillText(formatBytes(r.node.sizeBytes), r.x + 8, r.y + 32);

    this.ctx.restore();
  }

  /**
   * 綁定滑鼠懸停與點擊互動
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isVisible) return;
      const bRect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - bRect.left;
      const mouseY = e.clientY - bRect.top;

      let found: TreemapRect | null = null;
      for (let i = this.rects.length - 1; i >= 0; i--) {
        const r = this.rects[i];
        if (
          mouseX >= r.x &&
          mouseX <= r.x + r.w &&
          mouseY >= r.y &&
          mouseY <= r.y + r.h
        ) {
          found = r;
          break;
        }
      }

      if (found !== this.hoveredRect) {
        this.hoveredRect = found;
        this.render();
      }

      if (found) {
        this.showTooltip(found.node, e.clientX, e.clientY);
      } else {
        this.hideTooltip();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredRect = null;
      this.render();
      this.hideTooltip();
    });

    this.canvas.addEventListener('click', () => {
      if (!this.isVisible) return;
      if (this.hoveredRect && this.onNodeClick) {
        this.onNodeClick(this.hoveredRect.node);
      }
    });

    window.addEventListener('resize', () => this.resize());
  }

  private showTooltip(node: MftRecordSummary, clientX: number, clientY: number): void {
    const nameEl = this.tooltipEl.querySelector('.tooltip-name') as HTMLElement;
    const sizeEl = this.tooltipEl.querySelector('.tooltip-size') as HTMLElement;
    const pathEl = this.tooltipEl.querySelector('.tooltip-path') as HTMLElement;
    const badgeEl = this.tooltipEl.querySelector('.tooltip-badge') as HTMLElement;

    if (nameEl) nameEl.textContent = node.name;
    if (sizeEl) sizeEl.textContent = formatBytes(node.sizeBytes);
    if (pathEl) pathEl.textContent = node.path;

    if (badgeEl) {
      if (node.isReparsePoint) {
        badgeEl.textContent = '⚡ Reparse Point / Junction';
        badgeEl.className = 'tooltip-badge symlink';
        badgeEl.style.display = 'inline-block';
      } else if (node.isDirectory) {
        badgeEl.textContent = `📁 資料夾 (${node.children ? node.children.length : 0} 項目)`;
        badgeEl.className = 'tooltip-badge';
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // 防止 tooltip 跑出視窗邊界
    const tooltipW = 260;
    const tooltipH = 110;
    let posX = clientX + 16;
    let posY = clientY + 16;

    if (posX + tooltipW > window.innerWidth) {
      posX = clientX - tooltipW - 16;
    }
    if (posY + tooltipH > window.innerHeight) {
      posY = clientY - tooltipH - 16;
    }

    this.tooltipEl.style.left = `${posX}px`;
    this.tooltipEl.style.top = `${posY}px`;
    this.tooltipEl.classList.add('visible');
  }

  private hideTooltip(): void {
    this.tooltipEl.classList.remove('visible');
  }
}
