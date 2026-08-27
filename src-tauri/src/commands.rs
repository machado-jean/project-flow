use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::{
    database::DATABASE_URL,
    persistence::{self, ProjectRecord, TaskRecord, WorkspaceData},
};

async fn sqlite_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
    let instances = db_instances.0.read().await;
    let database = instances
        .get(DATABASE_URL)
        .ok_or_else(|| "O banco de dados do ProjectFlow não foi carregado.".to_owned())?;

    let DbPool::Sqlite(pool) = database;
    Ok(pool.clone())
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
pub async fn delete_task_tree(
    db_instances: State<'_, DbInstances>,
    task_id: String,
) -> Result<(), String> {
    let pool = sqlite_pool(&db_instances).await?;
    persistence::delete_task_tree(&pool, &task_id)
        .await
        .map_err(|error| format!("Não foi possível excluir a tarefa: {error}"))
}
