mod commands;
mod database;
mod migration_compatibility;
mod persistence;

use database::{database_url, migrations, DATABASE_SCHEMA_VERSION};
use migration_compatibility::{DevelopmentDatabaseOutcome, MigrationCompatibilityOutcome};
use tauri::Manager;
use tauri_plugin_log::log::{info, LevelFilter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::database_url,
            commands::load_workspace,
            commands::save_calendar,
            commands::save_project,
            commands::reorder_projects,
            commands::delete_project,
            commands::save_task,
            commands::reorder_tasks,
            commands::apply_schedule_changes,
            commands::delete_task_tree
        ])
        .plugin(migration_compatibility::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin({
            let database_url = database_url();
            tauri_plugin_sql::Builder::default()
                .add_migrations(&database_url, migrations())
                .build()
        })
        .setup(|app| {
            match app.state::<DevelopmentDatabaseOutcome>().inner() {
                DevelopmentDatabaseOutcome::NotApplicable => {}
                DevelopmentDatabaseOutcome::AlreadyPresent => {
                    info!("Shared development database is already present");
                }
                DevelopmentDatabaseOutcome::SourceNotPresent => {
                    info!("No AppData database was available to initialize shared development data");
                }
                DevelopmentDatabaseOutcome::Imported { backup_path } => {
                    info!(
                        "AppData database imported into shared development data after verified backup at {}",
                        backup_path.display()
                    );
                }
            }
            match app.state::<MigrationCompatibilityOutcome>().inner() {
                MigrationCompatibilityOutcome::DatabaseNotPresent => {
                    info!("No existing database required migration compatibility repair");
                }
                MigrationCompatibilityOutcome::AlreadyCurrent => {
                    info!("Database migration checksums are current");
                }
                MigrationCompatibilityOutcome::Repaired { backup_path } => {
                    info!(
                        "Known migration 3 checksum drift repaired after verified backup at {}",
                        backup_path.display()
                    );
                }
            }
            info!(
                "ProjectFlow {} started with database schema {} using {}",
                env!("CARGO_PKG_VERSION"),
                DATABASE_SCHEMA_VERSION,
                database_url()
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
