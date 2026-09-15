use std::collections::HashMap;
use winreg::enums::*;
use winreg::RegKey;

use crate::models::InstalledApp;

pub struct AppsEngine;

impl AppsEngine {
    pub fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
        let mut apps: HashMap<String, InstalledApp> = HashMap::new();

        let hives = vec![
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
            (HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
        ];

        for (hive_type, path) in hives {
            let hive = RegKey::predef(hive_type);
            if let Ok(uninstall_key) = hive.open_subkey_with_flags(path, KEY_READ) {
                for key_result in uninstall_key.enum_keys() {
                    if let Ok(key_name) = key_result {
                        if let Ok(app_key) = uninstall_key.open_subkey_with_flags(&key_name, KEY_READ) {
                            let display_name: String = match app_key.get_value("DisplayName") {
                                Ok(val) => val,
                                Err(_) => continue,
                            };

                            let system_component: u32 = app_key.get_value("SystemComponent").unwrap_or(0);
                            if system_component == 1 {
                                continue;
                            }

                            let publisher: Option<String> = app_key.get_value("Publisher").ok();
                            let display_version: Option<String> = app_key.get_value("DisplayVersion").ok();
                            let install_date: Option<String> = app_key.get_value("InstallDate").ok();
                            let uninstall_string: Option<String> = app_key.get_value("UninstallString").ok();
                            let install_location: Option<String> = app_key.get_value("InstallLocation").ok();
                            
                            let estimated_size_kb: Option<u32> = app_key.get_value("EstimatedSize").ok();
                            let estimated_size_bytes = estimated_size_kb.map(|kb| (kb as u64) * 1024);

                            if !apps.contains_key(&display_name) {
                                apps.insert(
                                    display_name.clone(),
                                    InstalledApp {
                                        id: key_name,
                                        display_name,
                                        publisher,
                                        display_version,
                                        install_date,
                                        estimated_size_bytes,
                                        uninstall_string,
                                        install_location,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }

        let mut app_list: Vec<InstalledApp> = apps.into_values().collect();
        app_list.sort_by(|a, b| {
            b.estimated_size_bytes.unwrap_or(0).cmp(&a.estimated_size_bytes.unwrap_or(0))
        });

        Ok(app_list)
    }

    pub fn uninstall_app(uninstall_string: &str) -> Result<(), String> {
        if uninstall_string.is_empty() {
            return Err("Uninstall string is empty".into());
        }

        let status = std::process::Command::new("cmd")
            .arg("/C")
            .arg(uninstall_string)
            .status()
            .map_err(|e| format!("Failed to execute uninstaller: {}", e))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("Uninstaller exited with status: {}", status))
        }
    }
}
