use tauri_plugin_sql::{Migration, MigrationKind};

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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zhuzhao.db", migrations())
                .build(),
        )
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
