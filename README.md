# StorageFitness

Windows 磁碟空間分析加清理工具

## 功能

| 功能 | 說明 |
| --- | --- |
| 掃描 | 掃描指定資料夾 用 Treemap 顯示各資料夾佔用 |
| 清理規則 | 依 `rules.json` 找出可刪的東西 像 node_modules Rust target 暫存檔 |
| 規則更新 | 啟動時可從本 repo 線上抓最新 `rules.json` |
| 安全檢查 | System32 WinSxS pagefile hiberfil 這類系統路徑會被擋 不給刪 |

## 技術線

- Tauri 2
- Rust 後端 walkdir reqwest glob windows crate
- TypeScript 前端 Vite 原生 DOM 沒用框架

## 安裝與啟動

需要 Node 和 Rust 工具鏈

```bash
npm install
npm run tauri dev
```

打包

```bash
npm run tauri build
```

## 注意事項

- 只支援 Windows
- 符號連結和 junction 不會往下掃
- NTFS MFT 直讀引擎目前只有介面 還沒實作 之後要管理員權限
- productName 和 identifier 還是 Tauri 範本預設值 沒改
