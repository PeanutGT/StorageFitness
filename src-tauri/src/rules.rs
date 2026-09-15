// ============================================================================
// 模組：rules.rs — 智慧清理規則引擎與 OTA 熱更新
// 負責人：👁️ Gemini 3.1 Pro (架構師)
// 規範：與前端 `CleanupRule` 型別保持絕對一致，利用 glob 進行高效節點配對。
// ============================================================================

use glob::Pattern;
use std::path::Path;

use crate::errors::{EngineError, EngineResult};
use crate::models::{CleanupAnalysisResult, CleanupRule, FileNode};

pub struct RulesEngine;

impl RulesEngine {
    /// 優先讀取本地 `rules.json`，若不存在或發生錯誤才嘗試從官方雲端倉庫 (OTA) 下載。
    /// 這裡使用 reqwest 的非同步 (async) API，不會阻塞 Tauri 執行緒。
    pub async fn fetch_ota_rules() -> EngineResult<Vec<CleanupRule>> {
        // 先嘗試讀取本地規則
        if let Ok(local_content) = std::fs::read_to_string("rules.json") {
            if let Ok(rules) = serde_json::from_str::<Vec<CleanupRule>>(&local_content) {
                return Ok(rules);
            }
        }
        let url = "https://raw.githubusercontent.com/PeanutGT/StorageFitness/main/rules.json";

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| {
                EngineError::NetworkError(format!("Failed to build HTTP client: {}", e))
            })?;

        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| EngineError::NetworkError(format!("HTTP Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(EngineError::NetworkError(format!(
                "HTTP Status {} - Failed to fetch rules",
                response.status()
            )));
        }

        let rules: Vec<CleanupRule> = response
            .json()
            .await
            .map_err(|e| EngineError::NetworkError(format!("Failed to parse JSON rules: {}", e)))?;

        Ok(rules)
    }

    /// 給定一組規則，在已掃描的磁碟樹狀結構 (FileNode) 中精算每個規則實際匹配的總容量，並收集目標路徑。
    /// 回傳一個 `CleanupAnalysisResult`，包含更新了 `estimated_size` 的新規則清單與 `matched_paths`。
    pub fn analyze_cleanup_targets(
        tree: &FileNode,
        rules: &[CleanupRule],
    ) -> CleanupAnalysisResult {
        let mut analyzed_rules = Vec::with_capacity(rules.len());
        let mut matched_paths = std::collections::HashMap::new();

        for rule in rules {
            let mut updated_rule = rule.clone();
            let pattern_str = &rule.target_pattern;

            // 將 pattern 也做一層保險，統一使用 `/`
            let normalized_pattern = pattern_str.replace("\\", "/");
            let compiled_pattern = match Pattern::new(&normalized_pattern) {
                Ok(p) => p,
                Err(_) => {
                    // 若規則解析失敗，該項目估算大小為 0
                    updated_rule.estimated_size = Some(0);
                    analyzed_rules.push(updated_rule);
                    continue;
                }
            };

            let mut total_size = 0;
            let mut current_matched = Vec::new();
            Self::traverse_and_match(
                tree,
                &compiled_pattern,
                &mut total_size,
                &mut current_matched,
            );

            updated_rule.estimated_size = Some(total_size);
            matched_paths.insert(rule.rule_id.clone(), current_matched);
            analyzed_rules.push(updated_rule);
        }

        CleanupAnalysisResult {
            rules: analyzed_rules,
            matched_paths,
        }
    }

    /// 遞迴遍歷檔案樹。
    /// 效能優化：若資料夾路徑已符合 pattern (例如 `**/node_modules`)，
    /// 則直接將其路徑加入清單並累加其 `size_bytes`，停止向下遍歷。
    fn traverse_and_match(
        node: &FileNode,
        pattern: &Pattern,
        total_size: &mut u64,
        current_matched: &mut Vec<String>,
    ) {
        // 路徑正規化：將 Windows 的 `\` 轉換為 Unix 的 `/` 以符合 glob 預期
        let normalized_path = node.path.replace("\\", "/");
        let path = Path::new(&normalized_path);

        if pattern.matches_path(path) {
            *total_size += node.size_bytes;
            current_matched.push(node.path.clone()); // 儲存原始 Windows 路徑供後續刪除使用
            return; // 已經匹配到，不繼續深入子節點
        }

        if let Some(children) = &node.children {
            for child in children {
                Self::traverse_and_match(child, pattern, total_size, current_matched);
            }
        }
    }
}
