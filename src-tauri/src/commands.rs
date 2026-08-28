use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::{
    database,
    persistence::{
        self, CalendarRecord, ProjectRecord, ScheduleChangeSetRecord, TaskRecord, WorkspaceData,
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
