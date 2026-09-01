mod commands;
mod database;
mod migration_compatibility;
mod persistence;
mod portability;

use database::{database_url, migrations, DATABASE_SCHEMA_VERSION};
use migration_compatibility::{DevelopmentDatabaseOutcome, MigrationCompatibilityOutcome};
use tauri::Manager;
use tauri_plugin_log::log::{info, LevelFilter};

#[cfg(feature = "e2e")]
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_builder = tauri_plugin_log::Builder::new().level(LevelFilter::Info);
    #[cfg(feature = "e2e")]
    let log_builder = log_builder.clear_targets().targets([
        Target::new(TargetKind::Stdout),
        Target::new(TargetKind::Folder {
            path: std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join(".local")
                .join("e2e")
                .join("logs"),
            file_name: Some("ProjectFlow-e2e".into()),
        }),
    ]);

    let builder = tauri::Builder::default()
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
            commands::delete_task_tree,
            commands::save_duplication_bundle,
            commands::save_template_bundle,
            commands::delete_template,
            commands::export_project,
            commands::export_workspace,
            commands::choose_import_package,
            commands::apply_import_package,
            commands::create_backup,
            commands::open_backup_folder,
            commands::choose_restore_backup,
            commands::restore_backup
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(migration_compatibility::init())
        .plugin(log_builder.build())
        .plugin({
            let database_url = database_url();
            tauri_plugin_sql::Builder::default()
                .add_migrations(&database_url, migrations())
                .build()
        });
    builder
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
