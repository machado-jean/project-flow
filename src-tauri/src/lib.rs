mod commands;
mod database;
mod persistence;

use database::{migrations, DATABASE_SCHEMA_VERSION, DATABASE_URL};
use tauri_plugin_log::log::{info, LevelFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::load_workspace,
            commands::save_project,
            commands::reorder_projects,
            commands::delete_project,
            commands::save_task,
            commands::reorder_tasks,
            commands::delete_task_tree
        ])
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .setup(|_| {
            info!(
                "ProjectFlow {} started with database schema {}",
                env!("CARGO_PKG_VERSION"),
                DATABASE_SCHEMA_VERSION
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
