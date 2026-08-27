mod database;

use database::{migrations, DATABASE_SCHEMA_VERSION, DATABASE_URL};
use tauri_plugin_log::log::{info, LevelFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
