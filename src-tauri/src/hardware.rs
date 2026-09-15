use std::process::Command;
use serde_json::Value;

use crate::errors::{EngineError, EngineResult};
use crate::models::DiskHealthMetrics;

pub struct HardwareEngine;

impl HardwareEngine {
    pub fn get_disk_health() -> EngineResult<Vec<DiskHealthMetrics>> {
        // 使用 PowerShell 呼叫 WMI 取得 StorageReliabilityCounter
        let ps_script = "Get-PhysicalDisk | Get-StorageReliabilityCounter | Select-Object DeviceId, Temperature, Wear, ReadErrorsTotal, WriteErrorsTotal | ConvertTo-Json -Compress";

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_script])
            .output()
            .map_err(|e| EngineError::Win32Error { operation: "PowerShell".to_string(), message: e.to_string() })?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // 如果 PowerShell 拋出權限錯誤 (PermissionDenied)
        if stderr.contains("PermissionDenied") || stderr.contains("Access is denied") {
            return Err(EngineError::InsufficientPrivilege("ELEVATION_REQUIRED".to_string()));
        }

        if !output.status.success() {
            // 有些虛擬機或環境可能完全不支援 StorageReliabilityCounter
            return Err(EngineError::Win32Error { operation: "PowerShell".to_string(), message: format!("Failed to read SMART: {}", stderr) });
        }

        let stdout = stdout.trim();
        if stdout.is_empty() {
            return Ok(vec![]);
        }

        // 解析 JSON (可能是物件或陣列)
        let parsed: Value = serde_json::from_str(stdout).map_err(|e| {
            EngineError::Win32Error { operation: "Parse JSON".to_string(), message: e.to_string() }
        })?;

        let mut metrics = Vec::new();

        if let Some(arr) = parsed.as_array() {
            for item in arr {
                if let Some(m) = Self::parse_metric_item(item) {
                    metrics.push(m);
                }
            }
        } else if parsed.is_object() {
            if let Some(m) = Self::parse_metric_item(&parsed) {
                metrics.push(m);
            }
        }

        Ok(metrics)
    }

    fn parse_metric_item(item: &Value) -> Option<DiskHealthMetrics> {
        let device_id = item.get("DeviceId")?.as_str()?.to_string();
        
        let temperature = item.get("Temperature").and_then(|v| v.as_f64());
        let wear = item.get("Wear").and_then(|v| v.as_f64());
        let read_errors_total = item.get("ReadErrorsTotal").and_then(|v| v.as_u64());
        let write_errors_total = item.get("WriteErrorsTotal").and_then(|v| v.as_u64());

        Some(DiskHealthMetrics {
            device_id,
            temperature,
            wear,
            read_errors_total,
            write_errors_total: None,
            power_on_hours: None,
            raw_data: None,
        })
    }
}
