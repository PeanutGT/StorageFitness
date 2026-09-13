### 1. PR 概述
- **PR 類型**: [Feature / Bugfix / Security / Rule-Update / Performance]
- **主導 Agent**: [🧠 Claude Opus 4.6 / ⚡ Gemini 3.8 Flash / 👁️ Gemini 3.1 Pro]
- **關聯 Issue**: #

### 2. 變更詳情說明
<!-- 簡要說明本次 PR 實作的機制與影響範圍 -->

### 3. Agent 專屬審查清單 (Checklist)

#### 🧠 若為底層/安全性變更 (Claude Opus 4.6)：
- [ ] **Unsafe 審查**：本次提交是否包含 `unsafe` 區塊？若是，是否包含完整的 Safe Abstraction 與 `// SAFETY:` 註解？
- [ ] **Reparse Point 邊界防護**：涉及目錄操作時，是否主動阻斷了 Symlink / Junction 遍歷？
- [ ] **錯誤處理**：代碼中是否完全無未防護的 `.unwrap()` 或 `panic!`？是否皆透過 `thiserror` 處理？
- [ ] **記憶體釋放**：Win32 FFI 資源（Handle、Buffer）是否透過 RAII (Drop trait) 自動安全釋放？

#### ⚡ 若為 UI / 規則庫 / 測試變更 (Gemini 3.8 Flash)：
- [ ] **IPC 契約符合性**：是否嚴格遵守架構師定義的 IPC Types，無自行臆造後端 API？
- [ ] **效能基準**：Canvas/Treemap 視覺化渲染在大數據量（10 萬筆節點）下是否維持 60 FPS？
- [ ] **規則驗證**：新增的 Cleanup Rule JSON 是否通過 Schema 校驗，且 Regex 具備防 ReDoS 機制？
- [ ] **測試覆蓋**：新增的功能是否具備對應的 Vitest 或 `#[test]` 單元測試？

### 4. 👁️ 架構師簽核 (Gemini 3.1 Pro)
- [ ] 架構與跨模組邊界審查通過
- [ ] 符合「超越 Windows 內建工具」產品規格
