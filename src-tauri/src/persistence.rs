use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CalendarRecord {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(skip)]
    #[serde(default)]
    pub working_days: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub calendar_id: String,
    pub position: i64,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub code: Option<String>,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub progress: i64,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub duration_days: Option<i64>,
    pub scheduling_mode: String,
    pub position: i64,
    pub assignee: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(skip)]
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub calendars: Vec<CalendarRecord>,
    pub projects: Vec<ProjectRecord>,
    pub tasks: Vec<TaskRecord>,
}

#[derive(FromRow)]
struct WorkingDayRow {
    calendar_id: String,
    weekday: i64,
}

#[derive(FromRow)]
struct TaskTagRow {
    task_id: String,
    tag_name: String,
}

pub async fn load_workspace(pool: &SqlitePool) -> Result<WorkspaceData, sqlx::Error> {
    let mut calendars = sqlx::query_as::<_, CalendarRecord>(
        "SELECT id, name, is_default, created_at, updated_at FROM calendars \
         ORDER BY is_default DESC, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let working_days = sqlx::query_as::<_, WorkingDayRow>(
        "SELECT calendar_id, weekday FROM calendar_working_days ORDER BY calendar_id, weekday",
    )
    .fetch_all(pool)
    .await?;
    let working_days_by_calendar = working_days.into_iter().fold(
        HashMap::<String, Vec<i64>>::new(),
        |mut days_by_calendar, row| {
            days_by_calendar
                .entry(row.calendar_id)
                .or_default()
                .push(row.weekday);
            days_by_calendar
        },
    );
    for calendar in &mut calendars {
        calendar.working_days = working_days_by_calendar
            .get(&calendar.id)
            .cloned()
            .unwrap_or_default();
    }

    let projects = sqlx::query_as::<_, ProjectRecord>(
        "SELECT id, name, description, status, calendar_id, position, is_archived, \
         created_at, updated_at FROM projects ORDER BY is_archived, position, created_at",
    )
    .fetch_all(pool)
    .await?;
    let mut tasks = sqlx::query_as::<_, TaskRecord>(
        "SELECT id, code, project_id, parent_id, title, description, status, priority, \
         progress, start_date, end_date, duration_days, scheduling_mode, position, assignee, \
         notes, created_at, updated_at FROM tasks ORDER BY project_id, parent_id, position, created_at",
    )
    .fetch_all(pool)
    .await?;
    let task_tags = sqlx::query_as::<_, TaskTagRow>(
        "SELECT task_id, tag_name FROM task_tags ORDER BY task_id, tag_name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let tags_by_task =
        task_tags
            .into_iter()
            .fold(HashMap::<String, Vec<String>>::new(), |mut tags, row| {
                tags.entry(row.task_id).or_default().push(row.tag_name);
                tags
            });
    for task in &mut tasks {
        task.tags = tags_by_task.get(&task.id).cloned().unwrap_or_default();
    }

    Ok(WorkspaceData {
        calendars,
        projects,
        tasks,
    })
}

pub async fn save_project(pool: &SqlitePool, project: &ProjectRecord) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO projects (
            id, name, description, status, calendar_id, position, is_archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            calendar_id = excluded.calendar_id,
            position = excluded.position,
            is_archived = excluded.is_archived,
            updated_at = excluded.updated_at",
    )
    .bind(&project.id)
    .bind(&project.name)
    .bind(&project.description)
    .bind(&project.status)
    .bind(&project.calendar_id)
    .bind(project.position)
    .bind(project.is_archived)
    .bind(&project.created_at)
    .bind(&project.updated_at)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn reorder_projects(
    pool: &SqlitePool,
    project_ids: &[String],
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    for (position, project_id) in project_ids.iter().enumerate() {
        let position = i64::try_from(position)
            .map_err(|_| sqlx::Error::Protocol("A posição do projeto excedeu o limite.".into()))?;
        let result = sqlx::query("UPDATE projects SET position = ? WHERE id = ?")
            .bind(position)
            .bind(project_id)
            .execute(&mut *transaction)
            .await?;
        if result.rows_affected() != 1 {
            return Err(sqlx::Error::RowNotFound);
        }
    }
    transaction.commit().await?;
    Ok(())
}

pub async fn save_task(pool: &SqlitePool, task: &TaskRecord) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;

    sqlx::query(
        "INSERT INTO tasks (
            id, code, project_id, parent_id, title, description, status, priority, progress,
            start_date, end_date, duration_days, scheduling_mode, position, assignee, notes,
            created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            code = excluded.code,
            parent_id = excluded.parent_id,
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            priority = excluded.priority,
            progress = excluded.progress,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            duration_days = excluded.duration_days,
            scheduling_mode = excluded.scheduling_mode,
            position = excluded.position,
            assignee = excluded.assignee,
            notes = excluded.notes,
            updated_at = excluded.updated_at",
    )
    .bind(&task.id)
    .bind(&task.code)
    .bind(&task.project_id)
    .bind(&task.parent_id)
    .bind(&task.title)
    .bind(&task.description)
    .bind(&task.status)
    .bind(&task.priority)
    .bind(task.progress)
    .bind(&task.start_date)
    .bind(&task.end_date)
    .bind(task.duration_days)
    .bind(&task.scheduling_mode)
    .bind(task.position)
    .bind(&task.assignee)
    .bind(&task.notes)
    .bind(&task.created_at)
    .bind(&task.updated_at)
    .execute(&mut *transaction)
    .await?;

    sqlx::query("DELETE FROM task_tags WHERE task_id = ?")
        .bind(&task.id)
        .execute(&mut *transaction)
        .await?;

    let mut unique_tags = HashMap::<String, String>::new();
    for raw_tag in &task.tags {
        let tag = raw_tag.trim();
        if !tag.is_empty() {
            unique_tags.insert(tag.to_lowercase(), tag.to_owned());
        }
    }
    for tag in unique_tags.values() {
        sqlx::query("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING")
            .bind(tag)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("INSERT INTO task_tags (task_id, tag_name) VALUES (?, ?)")
            .bind(&task.id)
            .bind(tag)
            .execute(&mut *transaction)
            .await?;
    }

    sqlx::query(
        "DELETE FROM tags WHERE NOT EXISTS (
            SELECT 1 FROM task_tags WHERE task_tags.tag_name = tags.name
         )",
    )
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(())
}

pub async fn reorder_tasks(pool: &SqlitePool, task_ids: &[String]) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    for (position, task_id) in task_ids.iter().enumerate() {
        let position = i64::try_from(position)
            .map_err(|_| sqlx::Error::Protocol("A posição da tarefa excedeu o limite.".into()))?;
        let result = sqlx::query("UPDATE tasks SET position = ? WHERE id = ?")
            .bind(position)
            .bind(task_id)
            .execute(&mut *transaction)
            .await?;
        if result.rows_affected() != 1 {
            return Err(sqlx::Error::RowNotFound);
        }
    }
    transaction.commit().await?;
    Ok(())
}

pub async fn delete_project(pool: &SqlitePool, project_id: &str) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(project_id)
        .execute(&mut *transaction)
        .await?;
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn delete_task_tree(pool: &SqlitePool, task_id: &str) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(task_id)
        .execute(&mut *transaction)
        .await?;
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

async fn cleanup_orphan_tags(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM tags WHERE NOT EXISTS (
            SELECT 1 FROM task_tags WHERE task_tags.tag_name = tags.name
         )",
    )
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    use super::{
        delete_project, delete_task_tree, load_workspace, reorder_projects, reorder_tasks,
        save_project, save_task, ProjectRecord, TaskRecord,
    };
    use crate::database::{CORE_SCHEMA, INITIAL_SCHEMA};

    const PROJECT_ID: &str = "10000000-0000-4000-8000-000000000001";
    const TASK_ID: &str = "20000000-0000-4000-8000-000000000001";
    const CHILD_ID: &str = "20000000-0000-4000-8000-000000000002";
    const NOW: &str = "2026-08-27T15:00:00.000Z";

    async fn database() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory SQLite should open");
        sqlx::raw_sql(INITIAL_SCHEMA)
            .execute(&pool)
            .await
            .expect("initial migration should execute");
        sqlx::raw_sql(CORE_SCHEMA)
            .execute(&pool)
            .await
            .expect("core migration should execute");
        pool
    }

    fn project() -> ProjectRecord {
        ProjectRecord {
            id: PROJECT_ID.into(),
            name: "Projeto Alfa".into(),
            description: None,
            status: "ACTIVE".into(),
            calendar_id: "00000000-0000-4000-8000-000000000001".into(),
            position: 0,
            is_archived: false,
            created_at: NOW.into(),
            updated_at: NOW.into(),
        }
    }

    fn task(id: &str, parent_id: Option<&str>) -> TaskRecord {
        TaskRecord {
            id: id.into(),
            code: None,
            project_id: PROJECT_ID.into(),
            parent_id: parent_id.map(str::to_owned),
            title: "Tarefa".into(),
            description: None,
            status: "NOT_STARTED".into(),
            priority: "NORMAL".into(),
            progress: 0,
            start_date: None,
            end_date: None,
            duration_days: None,
            scheduling_mode: "AUTO".into(),
            position: 0,
            assignee: None,
            notes: None,
            created_at: NOW.into(),
            updated_at: NOW.into(),
            tags: vec!["Operação".into(), "Crítica".into()],
        }
    }

    #[tokio::test]
    async fn saves_and_loads_project_task_and_tags() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        save_task(&pool, &task(TASK_ID, None))
            .await
            .expect("task should save");

        let workspace = load_workspace(&pool).await.expect("workspace should load");

        assert_eq!(workspace.projects.len(), 1);
        assert_eq!(workspace.tasks.len(), 1);
        assert_eq!(workspace.tasks[0].tags, vec!["Crítica", "Operação"]);
        assert_eq!(workspace.calendars[0].working_days, vec![1, 2, 3, 4, 5]);
    }

    #[tokio::test]
    async fn deletes_task_tree_and_orphan_tags_transactionally() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        save_task(&pool, &task(TASK_ID, None))
            .await
            .expect("parent should save");
        save_task(&pool, &task(CHILD_ID, Some(TASK_ID)))
            .await
            .expect("child should save");

        delete_task_tree(&pool, TASK_ID)
            .await
            .expect("tree should delete");

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        let tag_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags")
            .fetch_one(&pool)
            .await
            .expect("tag count should load");
        assert!(workspace.tasks.is_empty());
        assert_eq!(tag_count, 0);
    }

    #[tokio::test]
    async fn deleting_project_cascades_tasks() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        save_task(&pool, &task(TASK_ID, None))
            .await
            .expect("task should save");

        delete_project(&pool, PROJECT_ID)
            .await
            .expect("project should delete");

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert!(workspace.projects.is_empty());
        assert!(workspace.tasks.is_empty());
    }

    #[tokio::test]
    async fn reorders_projects_and_sibling_tasks_transactionally() {
        let pool = database().await;
        let first_project = project();
        let mut second_project = project();
        second_project.id = "10000000-0000-4000-8000-000000000002".into();
        second_project.name = "Projeto Beta".into();
        second_project.position = 1;
        save_project(&pool, &first_project)
            .await
            .expect("first project should save");
        save_project(&pool, &second_project)
            .await
            .expect("second project should save");

        let first_task = task(TASK_ID, None);
        let mut second_task = task(CHILD_ID, None);
        second_task.position = 1;
        save_task(&pool, &first_task)
            .await
            .expect("first task should save");
        save_task(&pool, &second_task)
            .await
            .expect("second task should save");

        reorder_projects(
            &pool,
            &[second_project.id.clone(), first_project.id.clone()],
        )
        .await
        .expect("projects should reorder");
        reorder_tasks(&pool, &[second_task.id.clone(), first_task.id.clone()])
            .await
            .expect("tasks should reorder");

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert_eq!(workspace.projects[0].id, second_project.id);
        assert_eq!(workspace.tasks[0].id, second_task.id);
    }
}
