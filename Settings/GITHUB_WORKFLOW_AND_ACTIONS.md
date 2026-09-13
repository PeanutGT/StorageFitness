# GitHub Synchronization, Multi-Agent Branching Strategy & CI/CD Pipeline
> **專案名稱**：Next-Gen Windows Disk Analyzer & Smart Cleaner  
> **適用架構**：Tauri v2 (Rust Backend + Webview Frontend) + Windows API  
> **版本**：v1.0  

本文件為專案在 GitHub 上的協同開發準則，詳細規範了 **Gemini 3.1 Pro (架構師)**、**Claude Opus 4.6 (底層攻堅手)** 與 **Gemini 3.8 Flash (高產能工程師)** 的分支管理、PR 審查機制、安全防護驗證清單，以及全自動化的 **GitHub Actions CI/CD Pipeline**。

---

## 1. 分支模型與權限策略 (Git Branching Strategy)

為避免多個 Agent 並行開發時產生代碼衝突，本專案採用嚴格的 **Trunk-Based + Feature Branch** 模型：

```
[main] (受保護分支，僅放 Production Release，需架構師簽核)
  ^
  |-- PR (Squash and Merge)
[develop] (日常整合分支，所有 CI 檢查必須為 Green)
  ^
  |-- PR (需包含測試與安全清單)
  |-- core/mft-parser-v1       (🧠 Claude Opus 4.6)
  |-- security/reparse-guard   (🧠 Claude Opus 4.6)
  |-- ui/treemap-canvas        (⚡ Gemini 3.8 Flash)
  |-- rules/developer-caches   (⚡ Gemini 3.8 Flash)
  |-- arch/ipc-contract-v1     (👁️ Gemini 3.1 Pro)
```

### 1.1 分支命名規範 (Branch Naming)
| Agent 角色 | 分支前綴 | 範例 | 說明 |
| :--- | :--- | :--- | :--- |
| **🧠 Claude Opus 4.6** | `core/*`<br>`security/*`<br>`ffi/*` | `core/mft-record-parser`<br>`security/reparse-point-defense`<br>`ffi/system-restore-win32` | 專注於 Rust 底層解析、Win32 API、記憶體安全 |
| **⚡ Gemini 3.8 Flash** | `ui/*`<br>`rules/*`<br>`test/*`<br>`scaffold/*` | `ui/glassmorphism-theme`<br>`rules/docker-node-json`<br>`test/vitest-treemap-perf`<br>`scaffold/tauri-v2-init` | 專注於前端元件、清理規則庫、自動化測試與鷹架 |
| **👁️ Gemini 3.1 Pro** | `arch/*`<br>`docs/*`<br>`release/*` | `arch/ipc-schema-definition`<br>`docs/security-architecture`<br>`release/v0.1.0-mvp` | 架構總體定義、IPC 契約規範、PRD 與正式發行 |

### 1.2 分支保護規則 (Branch Protection Rules for `main` & `develop`)
在 GitHub 倉庫設定中（`Settings` -> `Branches`）：
1. **Require a pull request before merging**：嚴禁直接 `git push` 到 `main` 與 `develop`。
2. **Require status checks to pass before merging**：必須通過 GitHub Actions 的全套 CI 測試（Rust Test、Clippy、Vitest、Rule Schema Validation）。
3. **Require review from Code Owner**：所有牽涉到 `src-tauri/src/core/` 與 `src-tauri/src/security/` 的 PR，必須指派並通過 **Gemini 3.1 Pro** 的架構審查。

---

## 2. Commit 訊息規範 (Conventional Commits)

每次 Commit 必須遵循標準結構：`<type>(<scope>): <subject>`

### 2.1 類型 (Type)
- `feat`: 新增功能（如新增 MFT 解析演算法、新增 Treemap 下鑽功能）。
- `fix`: 修復 Bug（如修復 Junction 誤刪問題、修復記憶體溢出）。
- `security`: 安全性改進與防護加固（如更新系統核心保護白名單）。
- `perf`: 效能優化（如減少二進位記憶體拷貝、加速渲染）。
- `rules`: 清理規則資料庫擴充或調整。
- `test`: 單元測試、整合測試或基準測試（Benchmark）。
- `chore`: 建置設定、依賴更新或 CI 調整。

### 2.2 範例
```bash
feat(mft): implement non-resident data run decoding for $MFT records
fix(security): prevent recursive deletion through directory junction points
rules(cache): add JetBrains and Visual Studio build artifact patterns
test(core): add edge-case unit tests for corrupted fixup arrays
```

---

## 3. Pull Request 範本與審查協議

在倉庫根目錄建立 `.github/pull_request_template.md`：

```markdown
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
```

---

## 4. 全自動 CI/CD 流水線配置 (GitHub Actions)

專案需在 `.github/workflows/ci.yml` 建立完整的自動化驗證流程。因涉及 Windows 原生 API、NTFS MFT 測試與 Tauri，CI 必須運行於 `windows-latest`。

### 檔案位置：`.github/workflows/ci.yml`

```yaml
name: Continuous Integration & Security Audits

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  # -------------------------------------------------------------
  # Job 1: 前端檢查、規則庫 Schema 驗證與前端單元測試 (⚡ Flash 主力)
  # -------------------------------------------------------------
  frontend-and-rules-validation:
    name: Frontend, UI & Rulebase Validation
    runs-on: windows-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Frontend Dependencies
        run: npm ci

      - name: Validate Cleanup Rules (JSON Schema Lint)
        run: npm run test:rules-schema

      - name: Run Vitest Unit Tests
        run: npm run test:unit

  # -------------------------------------------------------------
  # Job 2: Rust 底層引擎、安全規範與 Win32 FFI 測試 (🧠 Opus 主力)
  # -------------------------------------------------------------
  rust-core-engine-and-security:
    name: Rust Engine, Security Audit & MFT Tests
    runs-on: windows-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Install Stable Rust Toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Rust Cache Setup
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Check Rust Code Formatting
        run: cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

      - name: Run Clippy Linter (Zero-Warning Enforcement)
        run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

      - name: Run Rust Unit & Integration Tests (Reparse Point & MFT)
        run: cargo test --manifest-path src-tauri/Cargo.toml --verbose

  # -------------------------------------------------------------
  # Job 3: Tauri v2 端到端編譯相容性驗證 (Integration Gate)
  # -------------------------------------------------------------
  tauri-build-verification:
    name: Tauri Build Verification
    needs: [frontend-and-rules-validation, rust-core-engine-and-security]
    runs-on: windows-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Stable Rust Toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Rust Cache Setup
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Frontend Dependencies
        run: npm ci

      - name: Build Tauri Desktop Application (Dry Run)
        run: npm run tauri build -- --debug
```

---

## 5. 專案專屬 `.gitignore` 設定

在倉庫根目錄設定標準 `.gitignore`，確保二進位檔案、暫存快取不汙染 Git 歷史：

```gitignore
# Rust & Cargo Build Artifacts
src-tauri/target/
**/*.rs.bk
Cargo.lock

# Node & Frontend Build Artifacts
node_modules/
dist/
build/
.svelte-kit/
.vite/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Tauri Desktop Build Artifacts
src-tauri/gen/
src-tauri/wix/
src-tauri/binaries/

# Environment Variables & Local Secrets
.env
.env.local
.env.*.local
*.pem
*.key

# Operating System & IDE Files
.DS_Store
Thumbs.db
Desktop.ini
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.sublime-project
*.sublime-workspace

# App Specific Sandbox & Test Artifacts
*.quarantine/
test-disk-dump/
*.mft.raw
```

---

## 6. GitHub 同步與多人（Agent）協作操作手冊

### 6.1 本地與遠端倉庫初始化指令
```powershell
# 1. 在本地專案目錄初始化 Git
git init -b main

# 2. 加入遠端倉庫 (請替換為你的 GitHub 倉庫網址)
git remote add origin https://github.com/<your-username>/disk-analyzer-cleaner.git

# 3. 加入基礎架構文件並進行第一次提交
git add .
git commit -m "chore(init): initial project architecture and role protocol"
git push -u origin main

# 4. 建立並切換至 develop 分支
git checkout -b develop
git push -u origin develop
```

### 6.2 Agent 作業標準 SOP
1. **領取任務前**：
   ```powershell
   git checkout develop
   git pull origin develop
   git checkout -b <agent-prefix>/<feature-name>
   ```
2. **實作完成與測試通過後**：
   ```powershell
   git add .
   git commit -m "<type>(<scope>): <clear description>"
   git push origin <agent-prefix>/<feature-name>
   ```
3. **發起 Pull Request**：
   - 目標分支設定為 `develop`。
   - 勾選 PR 範本中的專屬檢查項目。
   - 等待 GitHub Actions CI 通過（綠燈）。
   - 由架構師 **Gemini 3.1 Pro** 進行最終審查並 Squash and Merge。
