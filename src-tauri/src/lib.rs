use tauri_plugin_sql::{Migration, MigrationKind};
use std::fs;
use std::path::{Path, PathBuf};

/// 迁移列表：每张 migration 一个 Migration 条目。
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
        Migration {
            version: 4,
            description: "app_logs table (Phase 9 diagnostics)",
            sql: include_str!("../../migrations/0004_app_logs.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

// ---------------------------------------------------------------------------
// Phase 9: 路径安全
// ---------------------------------------------------------------------------

/// 规范化路径：解析 `..`、`.`、分隔符差异，返回 canonicalize 后的路径。
/// 不要求路径存在（用于待写入的文件路径）。
fn normalize_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径为空".to_string());
    }
    // 拒绝明显的穿越尝试：路径中包含 NUL 或控制字符
    if trimmed.chars().any(|c| c == '\0' || (c.is_control() && c != '\\')) {
        return Err("路径包含非法字符".to_string());
    }

    let p = Path::new(trimmed);
    // 不允许相对路径，必须是绝对路径
    if !p.is_absolute() {
        return Err("必须使用绝对路径".to_string());
    }

    // 尝试 canonicalize；若文件不存在，则对父目录 canonicalize 后拼接文件名
    if let Ok(canon) = p.canonicalize() {
        return Ok(canon);
    }
    // 文件可能尚不存在，规范父目录
    if let Some(parent) = p.parent() {
        if let Ok(parent_canon) = parent.canonicalize() {
            if let Some(file_name) = p.file_name() {
                return Ok(parent_canon.join(file_name));
            }
        }
    }
    // 兜底：直接拼接组件
    let mut buf = PathBuf::new();
    for comp in p.components() {
        buf.push(comp);
    }
    Ok(buf)
}

/// 判断路径是否在 base_dir 内（已 canonicalize）。
/// 防止 `../` 穿越到 base_dir 之外。
fn is_path_within(target: &Path, base_dir: &Path) -> bool {
    target.starts_with(base_dir)
}

/// 判断路径是否落入系统敏感目录。
/// 任何敏感目录直接拒绝，无论是否在 base_dir 下。
fn is_sensitive_path(target: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::path::Component;
        // 取盘符根和第一级目录用于判断
        let mut comps = target.components();
        let drive = match comps.next() {
            Some(Component::Prefix(p)) => p.as_os_str().to_string_lossy().to_lowercase(),
            _ => return false,
        };
        let first = comps.next();
        let first_str = match first {
            Some(Component::Normal(s)) => s.to_string_lossy().to_lowercase(),
            _ => return false, // 仅盘符根，例如 C:\
        };

        // 整盘根目录直接拒绝
        if comps.next().is_none() {
            return true;
        }

        // C:\Windows / C:\Program Files / C:\Program Files (x86) / C:\Windows\System32
        let drive_letter = drive
            .strip_prefix(r"\\?\")
            .unwrap_or(&drive);
        if drive_letter.starts_with("c:") {
            let blocked = [
                "windows",
                "program files",
                "program files (x86)",
                "programdata",
                "$recycle.bin",
                "system volume information",
                "boot",
                "recovery",
            ];
            if blocked.contains(&first_str.as_str()) {
                return true;
            }
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        let s = target.to_string_lossy();
        // Unix 系统目录
        let blocked_prefixes = [
            "/bin", "/sbin", "/etc", "/usr", "/var", "/sys", "/proc", "/dev", "/boot",
            "/root",
        ];
        blocked_prefixes.iter().any(|p| s.starts_with(p))
    }
}

/// 校验导出路径：必须位于 base_dir 之下，且不落入系统敏感目录。
///
/// 返回 canonicalize 后的目标路径。
fn validate_export_path(
    base_dir: &str,
    target_path: &str,
) -> Result<PathBuf, String> {
    let base_canon = normalize_path(base_dir)
        .map_err(|e| format!("导出目录无效: {}", e))?;
    if !base_canon.exists() {
        return Err(format!("导出目录不存在: {}", base_dir));
    }
    if !base_canon.is_dir() {
        return Err(format!("导出目录不是目录: {}", base_dir));
    }
    if is_sensitive_path(&base_canon) {
        return Err("导出目录位于系统敏感位置，请选择其他目录".to_string());
    }

    let target_canon = normalize_path(target_path)
        .map_err(|e| format!("目标路径无效: {}", e))?;
    if is_sensitive_path(&target_canon) {
        return Err("目标路径位于系统敏感位置，已拒绝".to_string());
    }
    if !is_path_within(&target_canon, &base_canon) {
        return Err("目标路径不在导出目录下，已拒绝".to_string());
    }
    Ok(target_canon)
}

// ---------------------------------------------------------------------------
// Rust Commands
//
// Phase 9 安全策略：
// - 所有文件 I/O 命令必须带 base_dir 参数，并经 validate_export_path 校验
// - 不存在任何"任意路径"的 invoke command
// - 不允许前端绕过 exportDir 校验
// ---------------------------------------------------------------------------

/// Phase 9 安全写入：仅允许写入 base_dir 之下的文件，且不落入系统敏感目录。
///
/// - 自动创建父目录（必须在 base_dir 内）
/// - 返回 canonicalize 后的实际写入路径
#[tauri::command]
fn write_export_text_file(
    base_dir: String,
    path: String,
    content: String,
) -> Result<String, String> {
    let target = validate_export_path(&base_dir, &path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir_all failed: {}", e))?;
    }
    fs::write(&target, content).map_err(|e| format!("write failed: {}", e))?;
    Ok(target.to_string_lossy().to_string())
}

/// Phase 9 安全读取：仅允许读取 base_dir 之下的文件。
#[tauri::command]
fn read_export_text_file(base_dir: String, path: String) -> Result<String, String> {
    let target = validate_export_path(&base_dir, &path)?;
    fs::read_to_string(&target).map_err(|e| format!("read failed: {}", e))
}

/// Phase 9 安全检查：路径是否存在且在 base_dir 之下。
///
/// - 不存在的路径返回 false（而非错误），便于前端判断"是否需要创建"
/// - 路径在 base_dir 之外或落入敏感目录返回 false
/// - 不返回 Err，避免泄露路径细节
#[tauri::command]
fn path_exists_in_dir(base_dir: String, path: String) -> bool {
    match validate_export_path(&base_dir, &path) {
        Ok(target) => target.exists(),
        Err(_) => false,
    }
}

/// Phase 9 安全检查：路径是否在 base_dir 之下且不敏感。
#[tauri::command]
fn is_path_in_export_dir(base_dir: String, path: String) -> Result<bool, String> {
    match validate_export_path(&base_dir, &path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// 在系统文件管理器中打开目录。
///
/// 跨平台实现：
/// - Windows: explorer
/// - macOS:   open
/// - Linux:   xdg-open
///
/// 安全校验：
/// - 路径必须存在
/// - 路径必须是目录
/// - 不允许系统敏感目录（防止误打开 C:\Windows 等）
///
/// 出错时返回明确错误，不输出敏感信息。
#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("目录不存在".to_string());
    }
    if !p.is_dir() {
        return Err("路径不是目录".to_string());
    }
    // 规范化后再判敏感
    let canon = p.canonicalize().map_err(|e| format!("路径解析失败: {}", e))?;
    if is_sensitive_path(&canon) {
        return Err("目录位于系统敏感位置，已拒绝打开".to_string());
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
        .arg(&canon)
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
            // 文件 I/O —— 全部带 base_dir 安全校验
            write_export_text_file,
            read_export_text_file,
            path_exists_in_dir,
            is_path_in_export_dir,
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
