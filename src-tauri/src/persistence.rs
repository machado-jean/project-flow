use std::collections::{HashMap, HashSet};

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
    #[sqlx(skip)]
    #[serde(default)]
    pub exceptions: Vec<CalendarExceptionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CalendarExceptionRecord {
    pub id: String,
    pub calendar_id: String,
    #[sqlx(rename = "exception_date")]
    pub date: String,
    pub is_working_day: bool,
    pub name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    pub calendar_id: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DependencyRecord {
    pub id: String,
    pub project_id: String,
    pub predecessor_id: String,
    pub successor_id: String,
    #[sqlx(rename = "dependency_type")]
    #[serde(rename = "type")]
    pub dependency_type: String,
    pub lag_days: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateItemRecord {
    pub id: String,
    pub template_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub duration_days: Option<i64>,
    pub priority: String,
    pub initial_status: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(skip)]
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateDependencyRecord {
    pub id: String,
    pub template_id: String,
    pub predecessor_id: String,
    pub successor_id: String,
    #[sqlx(rename = "dependency_type")]
    #[serde(rename = "type")]
    pub dependency_type: String,
    pub lag_days: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicationBundleRecord {
    pub project: Option<ProjectRecord>,
    #[serde(default)]
    pub tasks: Vec<TaskRecord>,
    #[serde(default)]
    pub dependencies: Vec<DependencyRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateBundleRecord {
    pub template: TaskTemplateRecord,
    pub items: Vec<TaskTemplateItemRecord>,
    #[serde(default)]
    pub dependencies: Vec<TaskTemplateDependencyRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleChangeSetRecord {
    #[serde(default)]
    pub calendars_to_save: Vec<CalendarRecord>,
    #[serde(default)]
    pub tasks: Vec<TaskRecord>,
    #[serde(default)]
    pub dependencies_to_save: Vec<DependencyRecord>,
    #[serde(default)]
    pub dependency_ids_to_delete: Vec<String>,
    #[serde(default)]
    pub task_tree_ids_to_delete: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub calendars: Vec<CalendarRecord>,
    pub projects: Vec<ProjectRecord>,
    pub tasks: Vec<TaskRecord>,
    pub dependencies: Vec<DependencyRecord>,
    pub templates: Vec<TaskTemplateRecord>,
    pub template_items: Vec<TaskTemplateItemRecord>,
    pub template_dependencies: Vec<TaskTemplateDependencyRecord>,
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

#[derive(FromRow)]
struct TemplateTaskTagRow {
    template_item_id: String,
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
    let calendar_exceptions = sqlx::query_as::<_, CalendarExceptionRecord>(
        "SELECT id, calendar_id, exception_date, is_working_day, name, created_at, updated_at \
         FROM calendar_exceptions ORDER BY calendar_id, exception_date",
    )
    .fetch_all(pool)
    .await?;
    let exceptions_by_calendar = calendar_exceptions.into_iter().fold(
        HashMap::<String, Vec<CalendarExceptionRecord>>::new(),
        |mut exceptions, exception| {
            exceptions
                .entry(exception.calendar_id.clone())
                .or_default()
                .push(exception);
            exceptions
        },
    );
    for calendar in &mut calendars {
        calendar.exceptions = exceptions_by_calendar
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
        "SELECT id, code, project_id, parent_id, calendar_id, title, description, status, priority, \
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
    let dependencies = sqlx::query_as::<_, DependencyRecord>(
        "SELECT id, project_id, predecessor_id, successor_id, dependency_type, lag_days, \
         created_at, updated_at FROM task_dependencies ORDER BY project_id, created_at, id",
    )
    .fetch_all(pool)
    .await?;

    let templates = sqlx::query_as::<_, TaskTemplateRecord>(
        "SELECT id, name, description, created_at, updated_at FROM task_templates \
         ORDER BY name COLLATE NOCASE, created_at",
    )
    .fetch_all(pool)
    .await?;
    let mut template_items = sqlx::query_as::<_, TaskTemplateItemRecord>(
        "SELECT id, template_id, parent_id, title, description, duration_days, priority, \
         initial_status, position, created_at, updated_at FROM task_template_items \
         ORDER BY template_id, parent_id, position, created_at",
    )
    .fetch_all(pool)
    .await?;
    let template_tags = sqlx::query_as::<_, TemplateTaskTagRow>(
        "SELECT template_item_id, tag_name FROM task_template_tags \
         ORDER BY template_item_id, tag_name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let tags_by_template_item =
        template_tags
            .into_iter()
            .fold(HashMap::<String, Vec<String>>::new(), |mut tags, row| {
                tags.entry(row.template_item_id)
                    .or_default()
                    .push(row.tag_name);
                tags
            });
    for item in &mut template_items {
        item.tags = tags_by_template_item
            .get(&item.id)
            .cloned()
            .unwrap_or_default();
    }
    let template_dependencies = sqlx::query_as::<_, TaskTemplateDependencyRecord>(
        "SELECT id, template_id, predecessor_id, successor_id, dependency_type, lag_days, \
         created_at, updated_at FROM task_template_dependencies \
         ORDER BY template_id, created_at, id",
    )
    .fetch_all(pool)
    .await?;

    Ok(WorkspaceData {
        calendars,
        projects,
        tasks,
        dependencies,
        templates,
        template_items,
        template_dependencies,
    })
}

pub async fn save_calendar(
    pool: &SqlitePool,
    calendar: &CalendarRecord,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    save_calendar_record(&mut transaction, calendar).await?;
    transaction.commit().await?;
    Ok(())
}

pub(crate) async fn save_calendar_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    calendar: &CalendarRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO calendars (id, name, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at",
    )
    .bind(&calendar.id)
    .bind(&calendar.name)
    .bind(calendar.is_default)
    .bind(&calendar.created_at)
    .bind(&calendar.updated_at)
    .execute(&mut **transaction)
    .await?;

    sqlx::query("DELETE FROM calendar_working_days WHERE calendar_id = ?")
        .bind(&calendar.id)
        .execute(&mut **transaction)
        .await?;
    for weekday in &calendar.working_days {
        sqlx::query("INSERT INTO calendar_working_days (calendar_id, weekday) VALUES (?, ?)")
            .bind(&calendar.id)
            .bind(weekday)
            .execute(&mut **transaction)
            .await?;
    }

    sqlx::query("DELETE FROM calendar_exceptions WHERE calendar_id = ?")
        .bind(&calendar.id)
        .execute(&mut **transaction)
        .await?;
    for exception in &calendar.exceptions {
        sqlx::query(
            "INSERT INTO calendar_exceptions (
                id, calendar_id, exception_date, is_working_day, name, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&exception.id)
        .bind(&calendar.id)
        .bind(&exception.date)
        .bind(exception.is_working_day)
        .bind(&exception.name)
        .bind(&exception.created_at)
        .bind(&exception.updated_at)
        .execute(&mut **transaction)
        .await?;
    }

    Ok(())
}

pub async fn save_project(pool: &SqlitePool, project: &ProjectRecord) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    save_project_record(&mut transaction, project).await?;
    transaction.commit().await?;
    Ok(())
}

pub(crate) async fn save_project_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    project: &ProjectRecord,
) -> Result<(), sqlx::Error> {
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
    .execute(&mut **transaction)
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
    save_task_record(&mut transaction, task).await?;
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub(crate) async fn save_task_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    task: &TaskRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO tasks (
            id, code, project_id, parent_id, calendar_id, title, description, status, priority, progress,
            start_date, end_date, duration_days, scheduling_mode, position, assignee, notes,
            created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            code = excluded.code,
            parent_id = excluded.parent_id,
            calendar_id = excluded.calendar_id,
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
    .bind(&task.calendar_id)
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
    .execute(&mut **transaction)
    .await?;

    sqlx::query("DELETE FROM task_tags WHERE task_id = ?")
        .bind(&task.id)
        .execute(&mut **transaction)
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
            .execute(&mut **transaction)
            .await?;
        sqlx::query("INSERT INTO task_tags (task_id, tag_name) VALUES (?, ?)")
            .bind(&task.id)
            .bind(tag)
            .execute(&mut **transaction)
            .await?;
    }

    Ok(())
}

pub(crate) async fn save_dependency_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    dependency: &DependencyRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_dependencies (
            id, project_id, predecessor_id, successor_id, dependency_type, lag_days,
            created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            predecessor_id = excluded.predecessor_id,
            successor_id = excluded.successor_id,
            dependency_type = excluded.dependency_type,
            lag_days = excluded.lag_days,
            updated_at = excluded.updated_at",
    )
    .bind(&dependency.id)
    .bind(&dependency.project_id)
    .bind(&dependency.predecessor_id)
    .bind(&dependency.successor_id)
    .bind(&dependency.dependency_type)
    .bind(dependency.lag_days)
    .bind(&dependency.created_at)
    .bind(&dependency.updated_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn save_duplication_bundle(
    pool: &SqlitePool,
    bundle: &DuplicationBundleRecord,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    if let Some(project) = &bundle.project {
        save_project_record(&mut transaction, project).await?;
    }
    for task in &bundle.tasks {
        save_task_record(&mut transaction, task).await?;
    }
    for dependency in &bundle.dependencies {
        save_dependency_record(&mut transaction, dependency).await?;
    }
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub(crate) async fn save_template_item_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    item: &TaskTemplateItemRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_template_items (
            id, template_id, parent_id, title, description, duration_days, priority,
            initial_status, position, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&item.id)
    .bind(&item.template_id)
    .bind(&item.parent_id)
    .bind(&item.title)
    .bind(&item.description)
    .bind(item.duration_days)
    .bind(&item.priority)
    .bind(&item.initial_status)
    .bind(item.position)
    .bind(&item.created_at)
    .bind(&item.updated_at)
    .execute(&mut **transaction)
    .await?;

    let mut unique_tags = HashMap::<String, String>::new();
    for raw_tag in &item.tags {
        let tag = raw_tag.trim();
        if !tag.is_empty() {
            unique_tags.insert(tag.to_lowercase(), tag.to_owned());
        }
    }
    for tag in unique_tags.values() {
        sqlx::query("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING")
            .bind(tag)
            .execute(&mut **transaction)
            .await?;
        sqlx::query("INSERT INTO task_template_tags (template_item_id, tag_name) VALUES (?, ?)")
            .bind(&item.id)
            .bind(tag)
            .execute(&mut **transaction)
            .await?;
    }
    Ok(())
}

pub(crate) async fn save_template_dependency_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    dependency: &TaskTemplateDependencyRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_template_dependencies (
            id, template_id, predecessor_id, successor_id, dependency_type, lag_days,
            created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&dependency.id)
    .bind(&dependency.template_id)
    .bind(&dependency.predecessor_id)
    .bind(&dependency.successor_id)
    .bind(&dependency.dependency_type)
    .bind(dependency.lag_days)
    .bind(&dependency.created_at)
    .bind(&dependency.updated_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn save_template_bundle(
    pool: &SqlitePool,
    bundle: &TaskTemplateBundleRecord,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    save_template_bundle_record(&mut transaction, bundle).await?;
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub(crate) async fn save_template_bundle_record(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    bundle: &TaskTemplateBundleRecord,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO task_templates (id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            updated_at = excluded.updated_at",
    )
    .bind(&bundle.template.id)
    .bind(&bundle.template.name)
    .bind(&bundle.template.description)
    .bind(&bundle.template.created_at)
    .bind(&bundle.template.updated_at)
    .execute(&mut **transaction)
    .await?;
    sqlx::query("DELETE FROM task_template_items WHERE template_id = ?")
        .bind(&bundle.template.id)
        .execute(&mut **transaction)
        .await?;

    let mut inserted = HashSet::<String>::new();
    let mut remaining: Vec<&TaskTemplateItemRecord> = bundle.items.iter().collect();
    while !remaining.is_empty() {
        let previous_length = remaining.len();
        let mut pending = Vec::new();
        for item in remaining {
            if item
                .parent_id
                .as_ref()
                .is_none_or(|parent_id| inserted.contains(parent_id))
            {
                save_template_item_record(transaction, item).await?;
                inserted.insert(item.id.clone());
            } else {
                pending.push(item);
            }
        }
        if pending.len() == previous_length {
            return Err(sqlx::Error::Protocol(
                "A hierarquia do template contém pai ausente ou ciclo.".into(),
            ));
        }
        remaining = pending;
    }
    for dependency in &bundle.dependencies {
        save_template_dependency_record(transaction, dependency).await?;
    }
    Ok(())
}

pub async fn delete_template(pool: &SqlitePool, template_id: &str) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let result = sqlx::query("DELETE FROM task_templates WHERE id = ?")
        .bind(template_id)
        .execute(&mut *transaction)
        .await?;
    if result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }
    cleanup_orphan_tags(&mut transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn apply_schedule_changes(
    pool: &SqlitePool,
    changes: &ScheduleChangeSetRecord,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    for calendar in &changes.calendars_to_save {
        save_calendar_record(&mut transaction, calendar).await?;
    }
    for task_id in &changes.task_tree_ids_to_delete {
        sqlx::query("DELETE FROM tasks WHERE id = ?")
            .bind(task_id)
            .execute(&mut *transaction)
            .await?;
    }
    for dependency_id in &changes.dependency_ids_to_delete {
        sqlx::query("DELETE FROM task_dependencies WHERE id = ?")
            .bind(dependency_id)
            .execute(&mut *transaction)
            .await?;
    }
    for dependency in &changes.dependencies_to_save {
        save_dependency_record(&mut transaction, dependency).await?;
    }
    for task in &changes.tasks {
        save_task_record(&mut transaction, task).await?;
    }
    cleanup_orphan_tags(&mut transaction).await?;
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

pub(crate) async fn cleanup_orphan_tags(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM tags WHERE NOT EXISTS (
            SELECT 1 FROM task_tags WHERE task_tags.tag_name = tags.name
         ) AND NOT EXISTS (
            SELECT 1 FROM task_template_tags WHERE task_template_tags.tag_name = tags.name
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
        apply_schedule_changes, delete_project, delete_task_tree, delete_template, load_workspace,
        reorder_projects, reorder_tasks, save_calendar, save_duplication_bundle, save_project,
        save_task, save_template_bundle, CalendarExceptionRecord, CalendarRecord, DependencyRecord,
        DuplicationBundleRecord, ProjectRecord, ScheduleChangeSetRecord, TaskRecord,
        TaskTemplateBundleRecord, TaskTemplateDependencyRecord, TaskTemplateItemRecord,
        TaskTemplateRecord,
    };
    use crate::database::{CORE_SCHEMA, INITIAL_SCHEMA, REUSE_SCHEMA, SCHEDULING_SCHEMA};

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
        sqlx::raw_sql(SCHEDULING_SCHEMA)
            .execute(&pool)
            .await
            .expect("scheduling migration should execute");
        sqlx::raw_sql(REUSE_SCHEMA)
            .execute(&pool)
            .await
            .expect("reuse migration should execute");
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
            calendar_id: None,
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

    fn dependency() -> DependencyRecord {
        DependencyRecord {
            id: "40000000-0000-4000-8000-000000000001".into(),
            project_id: PROJECT_ID.into(),
            predecessor_id: TASK_ID.into(),
            successor_id: CHILD_ID.into(),
            dependency_type: "FS".into(),
            lag_days: 0,
            created_at: NOW.into(),
            updated_at: NOW.into(),
        }
    }

    fn template_bundle() -> TaskTemplateBundleRecord {
        let template_id = "60000000-0000-4000-8000-000000000001";
        let root_id = "70000000-0000-4000-8000-000000000001";
        let first_id = "70000000-0000-4000-8000-000000000002";
        let second_id = "70000000-0000-4000-8000-000000000003";
        TaskTemplateBundleRecord {
            template: TaskTemplateRecord {
                id: template_id.into(),
                name: "Entrega padrão".into(),
                description: Some("Estrutura reutilizável".into()),
                created_at: NOW.into(),
                updated_at: NOW.into(),
            },
            items: vec![
                TaskTemplateItemRecord {
                    id: root_id.into(),
                    template_id: template_id.into(),
                    parent_id: None,
                    title: "Entrega".into(),
                    description: None,
                    duration_days: None,
                    priority: "NORMAL".into(),
                    initial_status: "NOT_STARTED".into(),
                    position: 0,
                    created_at: NOW.into(),
                    updated_at: NOW.into(),
                    tags: vec![],
                },
                TaskTemplateItemRecord {
                    id: first_id.into(),
                    template_id: template_id.into(),
                    parent_id: Some(root_id.into()),
                    title: "Preparar".into(),
                    description: None,
                    duration_days: Some(1),
                    priority: "HIGH".into(),
                    initial_status: "NOT_STARTED".into(),
                    position: 0,
                    created_at: NOW.into(),
                    updated_at: NOW.into(),
                    tags: vec!["Modelo".into()],
                },
                TaskTemplateItemRecord {
                    id: second_id.into(),
                    template_id: template_id.into(),
                    parent_id: Some(root_id.into()),
                    title: "Executar".into(),
                    description: None,
                    duration_days: Some(2),
                    priority: "NORMAL".into(),
                    initial_status: "NOT_STARTED".into(),
                    position: 1,
                    created_at: NOW.into(),
                    updated_at: NOW.into(),
                    tags: vec!["Modelo".into()],
                },
            ],
            dependencies: vec![TaskTemplateDependencyRecord {
                id: "80000000-0000-4000-8000-000000000001".into(),
                template_id: template_id.into(),
                predecessor_id: first_id.into(),
                successor_id: second_id.into(),
                dependency_type: "FS".into(),
                lag_days: 1,
                created_at: NOW.into(),
                updated_at: NOW.into(),
            }],
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

    #[tokio::test]
    async fn saves_calendar_exceptions_and_task_calendar_override() {
        let pool = database().await;
        let calendar = CalendarRecord {
            id: "50000000-0000-4000-8000-000000000001".into(),
            name: "Operação especial".into(),
            is_default: false,
            created_at: NOW.into(),
            updated_at: NOW.into(),
            working_days: vec![1, 2, 3, 4, 5, 6],
            exceptions: vec![CalendarExceptionRecord {
                id: "30000000-0000-4000-8000-000000000001".into(),
                calendar_id: "50000000-0000-4000-8000-000000000001".into(),
                date: "2026-09-07".into(),
                is_working_day: false,
                name: Some("Feriado".into()),
                created_at: NOW.into(),
                updated_at: NOW.into(),
            }],
        };
        save_calendar(&pool, &calendar)
            .await
            .expect("calendar should save");
        let mut saved_task = task(TASK_ID, None);
        saved_task.calendar_id = Some(calendar.id.clone());
        save_project(&pool, &project())
            .await
            .expect("project should save");
        save_task(&pool, &saved_task)
            .await
            .expect("task should save");

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        let loaded_calendar = workspace
            .calendars
            .iter()
            .find(|candidate| candidate.id == calendar.id)
            .expect("saved calendar should load");
        assert_eq!(loaded_calendar.working_days, vec![1, 2, 3, 4, 5, 6]);
        assert_eq!(
            loaded_calendar.exceptions[0].name.as_deref(),
            Some("Feriado")
        );
        assert_eq!(workspace.tasks[0].calendar_id, Some(calendar.id));
    }

    #[tokio::test]
    async fn persists_dependency_and_schedule_changes_atomically() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        let predecessor = task(TASK_ID, None);
        let successor = task(CHILD_ID, None);
        save_task(&pool, &predecessor)
            .await
            .expect("predecessor should save");
        save_task(&pool, &successor)
            .await
            .expect("successor should save");
        let mut scheduled_successor = successor.clone();
        scheduled_successor.start_date = Some("2026-08-31".into());
        scheduled_successor.end_date = Some("2026-08-31".into());
        scheduled_successor.duration_days = Some(1);

        apply_schedule_changes(
            &pool,
            &ScheduleChangeSetRecord {
                calendars_to_save: vec![],
                tasks: vec![scheduled_successor],
                dependencies_to_save: vec![dependency()],
                dependency_ids_to_delete: vec![],
                task_tree_ids_to_delete: vec![],
            },
        )
        .await
        .expect("schedule should save atomically");

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert_eq!(workspace.dependencies.len(), 1);
        assert_eq!(
            workspace
                .tasks
                .iter()
                .find(|task| task.id == CHILD_ID)
                .and_then(|task| task.start_date.as_deref()),
            Some("2026-08-31")
        );
    }

    #[tokio::test]
    async fn rolls_back_all_task_changes_when_one_change_is_invalid() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        let predecessor = task(TASK_ID, None);
        let successor = task(CHILD_ID, None);
        save_task(&pool, &predecessor)
            .await
            .expect("predecessor should save");
        save_task(&pool, &successor)
            .await
            .expect("successor should save");
        let mut valid_change = predecessor.clone();
        valid_change.progress = 50;
        let mut invalid_change = successor.clone();
        invalid_change.progress = 101;

        let result = apply_schedule_changes(
            &pool,
            &ScheduleChangeSetRecord {
                calendars_to_save: vec![],
                tasks: vec![valid_change, invalid_change],
                dependencies_to_save: vec![],
                dependency_ids_to_delete: vec![],
                task_tree_ids_to_delete: vec![],
            },
        )
        .await;
        assert!(result.is_err());

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert!(workspace.tasks.iter().all(|task| task.progress == 0));
    }

    #[tokio::test]
    async fn rejects_unsupported_dependency_type_and_summary_relations() {
        let pool = database().await;
        save_project(&pool, &project())
            .await
            .expect("project should save");
        let predecessor = task(TASK_ID, None);
        let successor = task(CHILD_ID, None);
        save_task(&pool, &predecessor)
            .await
            .expect("predecessor should save");
        save_task(&pool, &successor)
            .await
            .expect("successor should save");

        let mut unsupported = dependency();
        unsupported.dependency_type = "SS".into();
        let unsupported_result = apply_schedule_changes(
            &pool,
            &ScheduleChangeSetRecord {
                calendars_to_save: vec![],
                tasks: vec![],
                dependencies_to_save: vec![unsupported],
                dependency_ids_to_delete: vec![],
                task_tree_ids_to_delete: vec![],
            },
        )
        .await;
        assert!(unsupported_result.is_err());

        let summary_child = TaskRecord {
            parent_id: Some(TASK_ID.into()),
            ..successor
        };
        save_task(&pool, &summary_child)
            .await
            .expect("child should make predecessor a summary task");
        let summary_result = apply_schedule_changes(
            &pool,
            &ScheduleChangeSetRecord {
                calendars_to_save: vec![],
                tasks: vec![],
                dependencies_to_save: vec![dependency()],
                dependency_ids_to_delete: vec![],
                task_tree_ids_to_delete: vec![],
            },
        )
        .await;
        assert!(summary_result.is_err());

        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert!(workspace.dependencies.is_empty());
    }

    #[tokio::test]
    async fn saves_loads_and_deletes_template_bundle_transactionally() {
        let pool = database().await;
        let bundle = template_bundle();

        save_template_bundle(&pool, &bundle)
            .await
            .expect("template bundle should save");
        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert_eq!(workspace.templates.len(), 1);
        assert_eq!(workspace.template_items.len(), 3);
        assert_eq!(workspace.template_dependencies.len(), 1);
        assert_eq!(workspace.template_items[1].tags, vec!["Modelo"]);

        delete_template(&pool, &bundle.template.id)
            .await
            .expect("template should delete");
        let workspace = load_workspace(&pool).await.expect("workspace should load");
        assert!(workspace.templates.is_empty());
        assert!(workspace.template_items.is_empty());
        assert!(workspace.template_dependencies.is_empty());
        let tag_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags")
            .fetch_one(&pool)
            .await
            .expect("tag count should load");
        assert_eq!(tag_count, 0);
    }

    #[tokio::test]
    async fn duplication_bundle_rolls_back_project_tasks_and_relations_together() {
        let pool = database().await;
        let duplicated_project = project();
        let predecessor = task(TASK_ID, None);
        let successor = task(CHILD_ID, None);
        let mut invalid_dependency = dependency();
        invalid_dependency.successor_id = "20000000-0000-4000-8000-999999999999".into();

        let result = save_duplication_bundle(
            &pool,
            &DuplicationBundleRecord {
                project: Some(duplicated_project),
                tasks: vec![predecessor, successor],
                dependencies: vec![invalid_dependency],
            },
        )
        .await;
        assert!(result.is_err());

        let project_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .expect("project count should load");
        let task_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
            .fetch_one(&pool)
            .await
            .expect("task count should load");
        assert_eq!(project_count, 0);
        assert_eq!(task_count, 0);
    }
}
