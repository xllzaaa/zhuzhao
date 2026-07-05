use tauri_plugin_sql::{Migration, MigrationKind};
use std::fs;
use std::path::Path;

/// 迁移列表：每张 migration 一个 Migration 条目。
/// Phase 1 仅含 schema_version；Phase 2 起在此追加业务表。
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init schema_version",
            sql: include_str!("../../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "core tables (events/tasks/journals/ideas/reminders/conversations/...)",
            sql: include_str!("../../migrations/0002_core_tables.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "app_settings table (Phase 8 Markdown export config)",
            sql: include_str!("../../migrations/0003_app_settings.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// 写文本文件（自动创建父目录）。返回成功或错误信息。
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir_all failed: {}", e))?;
    }
    fs::write(p, content).map_err(|e| format!("write failed: {}", e))?;
    Ok(())
}

/// 读取文本文件。文件不存在返回 Err。
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read failed: {}", e))
}

/// 检查路径是否存在。
#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 检查路径是否是目录。
#[tauri::command]
fn path_is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
}

/// 列出目录下的文件（仅文件名，不含子目录的递归）。
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("read_dir failed: {}", e))?;
    let mut names: Vec<String> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("entry failed: {}", e))?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

/// 在系统文件管理器中打开目录。
///
/// 跨平台实现：
/// - Windows: explorer
/// - macOS:   open
/// - Linux:   xdg-open
///
/// 校验：
/// - 路径必须存在
/// - 路径必须是目录
///
/// 出错时返回明确错误，不输出敏感信息。
#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("目录不存在: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        return Err("不支持的平台".to_string());
    }

    std::process::Command::new(program)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("打开目录失败: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zhuzhao.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            path_exists,
            path_is_dir,
            list_dir,
            open_directory,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
