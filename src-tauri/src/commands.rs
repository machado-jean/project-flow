use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_log::log::warn;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::{
    database,
    persistence::{
        self, CalendarRecord, DuplicationBundleRecord, ProjectRecord, ScheduleChangeSetRecord,
        TaskRecord, TaskTemplateBundleRecord, WorkspaceData,
    },
    portability::{
        self, BackupResult, ExportResult, ImportPackagePreview, ImportResult, ImportSelection,
        RestoreResult,
    },
};

async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
    let instances = db_instances.0.read().await;
    let database_url = database::database_url();
    let database = instances
        .get(&database_url)
        .ok_or_else(|| "O banco de dados do ProjectFlow não foi carregado.".to_owned())?;

    let DbPool::Sqlite(pool) = database;
    Ok(pool.clone())
}

#[tauri::command]
pub fn database_url() -> String {
    database::database_url()
}

#[tauri::command]
pub async fn save_calendar(
    db_instances: State<'_, DbInstances>,
    calendar: CalendarRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::save_calendar(&pool, &calendar)
        .await
        .map_err(|error| format!("Não foi possível salvar o calendário: {error}"))
}

#[tauri::command]
pub async fn load_workspace(db_instances: State<'_, DbInstances>) -> Result<WorkspaceData, String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::load_workspace(&pool)
        .await
        .map_err(|error| format!("Não foi possível carregar o workspace: {error}"))
}

#[tauri::command]
pub async fn save_project(
    db_instances: State<'_, DbInstances>,
    project: ProjectRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::save_project(&pool, &project)
        .await
        .map_err(|error| format!("Não foi possível salvar o projeto: {error}"))
}

#[tauri::command]
pub async fn reorder_projects(
    db_instances: State<'_, DbInstances>,
    project_ids: Vec<String>,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::reorder_projects(&pool, &project_ids)
        .await
        .map_err(|error| format!("Não foi possível reordenar os projetos: {error}"))
}

#[tauri::command]
pub async fn delete_project(
    db_instances: State<'_, DbInstances>,
    project_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::delete_project(&pool, &project_id)
        .await
        .map_err(|error| format!("Não foi possível excluir o projeto: {error}"))
}

#[tauri::command]
pub async fn save_task(
    db_instances: State<'_, DbInstances>,
    task: TaskRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::save_task(&pool, &task)
        .await
        .map_err(|error| format!("Não foi possível salvar a tarefa: {error}"))
}

#[tauri::command]
pub async fn reorder_tasks(
    db_instances: State<'_, DbInstances>,
    task_ids: Vec<String>,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::reorder_tasks(&pool, &task_ids)
        .await
        .map_err(|error| format!("Não foi possível reordenar as tarefas: {error}"))
}

#[tauri::command]
pub async fn apply_schedule_changes(
    db_instances: State<'_, DbInstances>,
    changes: ScheduleChangeSetRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::apply_schedule_changes(&pool, &changes)
        .await
        .map_err(|error| format!("Não foi possível atualizar o cronograma: {error}"))
}

#[tauri::command]
pub async fn delete_task_tree(
    db_instances: State<'_, DbInstances>,
    task_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::delete_task_tree(&pool, &task_id)
        .await
        .map_err(|error| format!("Não foi possível excluir a tarefa: {error}"))
}

#[tauri::command]
pub async fn save_duplication_bundle(
    db_instances: State<'_, DbInstances>,
    bundle: DuplicationBundleRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::save_duplication_bundle(&pool, &bundle)
        .await
        .map_err(|error| format!("Não foi possível duplicar a estrutura: {error}"))
}

#[tauri::command]
pub async fn save_template_bundle(
    db_instances: State<'_, DbInstances>,
    bundle: TaskTemplateBundleRecord,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::save_template_bundle(&pool, &bundle)
        .await
        .map_err(|error| format!("Não foi possível salvar o template: {error}"))
}

#[tauri::command]
pub async fn delete_template(
    db_instances: State<'_, DbInstances>,
    template_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::delete_template(&pool, &template_id)
        .await
        .map_err(|error| format!("Não foi possível excluir o template: {error}"))
}

fn portability_staging_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("portability"))
        .map_err(|error| format!("Não foi possível resolver a pasta temporária: {error}"))
}

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Não foi possível resolver a pasta do aplicativo: {error}"))?;
    Ok(database::database_backup_dir(&app_config_dir))
}

fn file_path(path: tauri_plugin_dialog::FilePath) -> Result<PathBuf, String> {
    path.into_path()
        .map_err(|error| format!("O caminho selecionado não é um arquivo local válido: {error}"))
}

fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    if path
        .extension()
        .is_some_and(|current| current.eq_ignore_ascii_case(extension))
    {
        path
    } else {
        path.with_extension(extension)
    }
}

fn portability_error(context: &str, error: String) -> String {
    warn!("ProjectFlow portability error during {context}: {error}");
    error
}

#[tauri::command]
pub async fn export_project(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    project_id: String,
    suggested_name: String,
) -> Result<Option<ExportResult>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Exportar projeto do ProjectFlow")
        .set_file_name(format!("{suggested_name}.projectflow"))
        .add_filter("Pacote ProjectFlow", &["projectflow"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = with_extension(file_path(selected)?, "projectflow");
    let pool = sqlite_pool(&db_instances).await?;
    portability::export_project(
        &pool,
        &project_id,
        &destination,
        &portability_staging_dir(&app)?,
    )
    .await
    .map(Some)
    .map_err(|error| portability_error("project export", error))
}

#[tauri::command]
pub async fn export_workspace(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<Option<ExportResult>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Exportar workspace do ProjectFlow")
        .set_file_name(format!(
            "projectflow-workspace-{}.projectflow",
            chrono::Local::now().format("%Y%m%d")
        ))
        .add_filter("Pacote ProjectFlow", &["projectflow"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = with_extension(file_path(selected)?, "projectflow");
    let pool = sqlite_pool(&db_instances).await?;
    portability::export_workspace(&pool, &destination, &portability_staging_dir(&app)?)
        .await
        .map(Some)
        .map_err(|error| portability_error("workspace export", error))
}

#[tauri::command]
pub async fn choose_import_package(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<Option<ImportPackagePreview>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Importar pacote do ProjectFlow")
        .add_filter("Pacote ProjectFlow", &["projectflow"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = file_path(selected)?;
    let pool = sqlite_pool(&db_instances).await?;
    portability::inspect_package(&pool, &path, &portability_staging_dir(&app)?)
        .await
        .map(Some)
        .map_err(|error| portability_error("package inspection", error))
}

#[tauri::command]
pub async fn apply_import_package(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    package_path: String,
    selection: ImportSelection,
) -> Result<ImportResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    portability::import_package(
        &pool,
        Path::new(&package_path),
        &portability_staging_dir(&app)?,
        &backup_dir(&app)?,
        &selection,
    )
    .await
    .map_err(|error| portability_error("package import", error))
}

#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<BackupResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    portability::create_backup(&pool, &backup_dir(&app)?, "manual")
        .await
        .map_err(|error| portability_error("manual backup", error))
}

#[tauri::command]
pub async fn choose_restore_backup(app: AppHandle) -> Result<Option<ImportPackagePreview>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Selecionar backup do ProjectFlow")
        .add_filter("Backup SQLite do ProjectFlow", &["sqlite"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    portability::inspect_backup(&file_path(selected)?)
        .await
        .map(Some)
        .map_err(|error| portability_error("backup inspection", error))
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    backup_path: String,
) -> Result<RestoreResult, String> {
    let pool = sqlite_pool(&db_instances).await?;
    portability::restore_backup(&pool, Path::new(&backup_path), &backup_dir(&app)?)
        .await
        .map_err(|error| portability_error("backup restore", error))
}
