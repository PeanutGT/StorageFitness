// ============================================================================
// 模組：rules.rs — 智慧清理規則引擎與 OTA 熱更新
// 負責人：👁️ Gemini 3.1 Pro (架構師)
// 規範：與前端 `CleanupRule` 型別保持絕對一致，利用 glob 進行高效節點配對。
// ============================================================================

use glob::Pattern;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::errors::{EngineError, EngineResult};
use crate::models::FileNode;

/// 智慧清理規則資料模型 (必須與前端 `CleanupRule` 保持一致)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRule {
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub target_pattern: String,
    pub risk_level: String,
    pub estimated_size: Option<u64>,
    pub default_selected: bool,
}

pub struct RulesEngine;

impl RulesEngine {
    /// 透過 HTTP 從官方雲端倉庫 (OTA) 下載最新的 JSON 規則庫。
    /// 這裡使用 reqwest 的非同步 (async) API，不會阻塞 Tauri 執行緒。
    pub async fn fetch_ota_rules() -> EngineResult<Vec<CleanupRule>> {
        let url = "https://raw.githubusercontent.com/PeanutGT/StorageFitness/main/rules.json";
        
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| EngineError::NetworkError(format!("Failed to build HTTP client: {}", e)))?;

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

    /// 給定一組規則，在已掃描的磁碟樹狀結構 (FileNode) 中精算每個規則實際匹配的總容量。
    /// 回傳一個更新了 `estimated_size` 的新規則清單。
    pub fn analyze_cleanup_targets(tree: &FileNode, rules: &[CleanupRule]) -> Vec<CleanupRule> {
        let mut analyzed_rules = Vec::with_capacity(rules.len());

        for rule in rules {
            let mut updated_rule = rule.clone();
            let pattern_str = &rule.target_pattern;
            
            // 將前綴 **/ 替換為有效格式，或者直接使用 glob 解析
            let compiled_pattern = match Pattern::new(pattern_str) {
                Ok(p) => p,
                Err(_) => {
                    // 若規則解析失敗，該項目估算大小為 0
                    updated_rule.estimated_size = Some(0);
                    analyzed_rules.push(updated_rule);
                    continue;
                }
            };

            let mut total_size = 0;
            Self::traverse_and_match(tree, &compiled_pattern, &mut total_size);
            
            updated_rule.estimated_size = Some(total_size);
            analyzed_rules.push(updated_rule);
        }

        analyzed_rules
    }

    /// 遞迴遍歷檔案樹。
    /// 效能優化：若資料夾路徑已符合 pattern (例如 `**/node_modules`)，
    /// 則直接累加其 `size_bytes` 並停止向下遍歷，避免重複計算其子節點大小。
    fn traverse_and_match(node: &FileNode, pattern: &Pattern, total_size: &mut u64) {
        let path = Path::new(&node.path);

        if pattern.matches_path(path) {
            *total_size += node.size_bytes;
            return;
        }

        if let Some(children) = &node.children {
            for child in children {
                Self::traverse_and_match(child, pattern, total_size);
            }
        }
    }
}
