use std::path::{Path, PathBuf};

use tauri_plugin_sql::{Migration, MigrationKind};

pub const PRODUCTION_DATABASE_URL: &str = "sqlite:projectflow.sqlite";
pub const DATABASE_FILENAME: &str = "projectflow.sqlite";
pub const DATABASE_SCHEMA_VERSION: i64 = 4;
pub const SCHEDULING_MIGRATION_VERSION: i64 = 3;

pub(crate) const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial.sql");
pub(crate) const CORE_SCHEMA: &str = include_str!("../migrations/0002_core.sql");
pub(crate) const SCHEDULING_SCHEMA: &str = include_str!("../migrations/0003_scheduling.sql");
pub(crate) const REUSE_SCHEMA: &str = include_str!("../migrations/0004_reuse.sql");

pub fn uses_shared_development_database() -> bool {
    !uses_e2e_database() && cfg!(any(debug_assertions, feature = "shared-dev-data"))
}

pub fn uses_e2e_database() -> bool {
    cfg!(feature = "e2e")
}

pub fn project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must be inside the ProjectFlow repository")
        .to_path_buf()
}

pub fn shared_development_database_path() -> PathBuf {
    project_root()
        .join(".local")
        .join("data")
        .join(DATABASE_FILENAME)
}

pub fn e2e_database_path() -> PathBuf {
    project_root()
        .join(".local")
        .join("e2e")
        .join("data")
        .join(DATABASE_FILENAME)
}

pub fn database_path(app_config_dir: &Path) -> PathBuf {
    if uses_e2e_database() {
        return e2e_database_path();
    }
    database_path_for_mode(
        app_config_dir,
        &project_root(),
        uses_shared_development_database(),
    )
}

pub fn database_backup_dir(app_config_dir: &Path) -> PathBuf {
    if uses_e2e_database() {
        project_root().join(".local").join("e2e").join("backups")
    } else if uses_shared_development_database() {
        project_root().join(".local").join("backups")
    } else {
        app_config_dir.join("backups")
    }
}

pub fn database_url() -> String {
    if uses_e2e_database() {
        sqlite_url(&e2e_database_path())
    } else if uses_shared_development_database() {
        sqlite_url(&shared_development_database_path())
    } else {
        PRODUCTION_DATABASE_URL.to_owned()
    }
}

fn database_path_for_mode(app_config_dir: &Path, project_root: &Path, shared: bool) -> PathBuf {
    if shared {
        project_root
            .join(".local")
            .join("data")
            .join(DATABASE_FILENAME)
    } else {
        app_config_dir.join(DATABASE_FILENAME)
    }
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:{}", path.to_string_lossy().replace('\\', "/"))
}

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create application metadata",
            sql: INITIAL_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create project and task core",
            sql: CORE_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: SCHEDULING_MIGRATION_VERSION,
            description: "add calendars and FS scheduling",
            sql: SCHEDULING_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: DATABASE_SCHEMA_VERSION,
            description: "add reusable task templates",
            sql: REUSE_SCHEMA,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use sqlx::{Connection, SqliteConnection};

    use super::{
        database_path_for_mode, migrations, sqlite_url, CORE_SCHEMA, DATABASE_FILENAME,
        DATABASE_SCHEMA_VERSION, INITIAL_SCHEMA, REUSE_SCHEMA, SCHEDULING_MIGRATION_VERSION,
        SCHEDULING_SCHEMA,
    };

    #[test]
    fn shared_development_database_is_inside_local_data() {
        let path = database_path_for_mode(
            Path::new("C:/Users/test/AppData/Roaming/com.projectflow.desktop"),
            Path::new("C:/workspace/project-flow"),
            true,
        );

        assert_eq!(
            path,
            Path::new("C:/workspace/project-flow")
                .join(".local")
                .join("data")
                .join(DATABASE_FILENAME)
        );
        assert_eq!(
            sqlite_url(&path),
            "sqlite:C:/workspace/project-flow/.local/data/projectflow.sqlite"
        );
    }

    #[test]
    fn production_database_remains_inside_app_config() {
        let app_config = Path::new("C:/Users/test/AppData/Roaming/com.projectflow.desktop");
        let path =
            database_path_for_mode(app_config, Path::new("C:/workspace/project-flow"), false);

        assert_eq!(path, app_config.join(DATABASE_FILENAME));
    }

    #[test]
    fn e2e_database_is_isolated_from_development_and_production() {
        let path = super::project_root()
            .join(".local")
            .join("e2e")
            .join("data")
            .join(DATABASE_FILENAME);

        assert_eq!(super::e2e_database_path(), path);
        assert_ne!(
            super::e2e_database_path(),
            super::shared_development_database_path()
        );
    }

    async fn in_memory_database() -> SqliteConnection {
        SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("in-memory SQLite should open")
    }

    #[tokio::test]
    async fn migrations_create_core_schema_on_new_database() {
        let mut database = in_memory_database().await;

        sqlx::raw_sql(INITIAL_SCHEMA)
            .execute(&mut database)
            .await
            .expect("initial migration should execute");
        sqlx::raw_sql(CORE_SCHEMA)
            .execute(&mut database)
            .await
            .expect("core migration should execute");
        sqlx::raw_sql(SCHEDULING_SCHEMA)
            .execute(&mut database)
            .await
            .expect("scheduling migration should execute");
        sqlx::raw_sql(REUSE_SCHEMA)
            .execute(&mut database)
            .await
            .expect("reuse migration should execute");

        let schema_version: String =
            sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'schema_version'")
                .fetch_one(&mut database)
                .await
                .expect("schema version should be stored");
        let sqlite_version: String = sqlx::query_scalar("SELECT sqlite_version()")
            .fetch_one(&mut database)
            .await
            .expect("SQLite should report its runtime version");

        assert_eq!(schema_version, DATABASE_SCHEMA_VERSION.to_string());
        assert!(!sqlite_version.is_empty());
        let default_working_days: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM calendar_working_days WHERE calendar_id = \
             '00000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("default working days should exist");
        assert_eq!(default_working_days, 5);
        let continuous_working_days: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM calendar_working_days WHERE calendar_id = \
             '00000000-0000-4000-8000-000000000002'",
        )
        .fetch_one(&mut database)
        .await
        .expect("continuous working days should exist");
        assert_eq!(continuous_working_days, 7);
        let template_table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'task_templates'",
        )
        .fetch_one(&mut database)
        .await
        .expect("template table should exist");
        assert_eq!(template_table_count, 1);
        println!("SQLite runtime version: {sqlite_version}");
    }

    #[tokio::test]
    async fn scheduling_upgrade_preserves_existing_data() {
        let mut database = in_memory_database().await;

        sqlx::raw_sql(INITIAL_SCHEMA)
            .execute(&mut database)
            .await
            .expect("initial migration should execute");
        sqlx::query("INSERT INTO app_metadata (key, value) VALUES ('existing', 'preserved')")
            .execute(&mut database)
            .await
            .expect("pre-upgrade data should be created");

        sqlx::raw_sql(CORE_SCHEMA)
            .execute(&mut database)
            .await
            .expect("core migration should execute on an existing database");
        sqlx::query(
            "INSERT INTO projects (
                id, name, status, calendar_id, position, is_archived, created_at, updated_at
             ) VALUES (
                '10000000-0000-4000-8000-000000000001', 'Preservado', 'ACTIVE',
                '00000000-0000-4000-8000-000000000001', 0, 0,
                '2026-08-27T15:00:00.000Z', '2026-08-27T15:00:00.000Z'
             )",
        )
        .execute(&mut database)
        .await
        .expect("pre-scheduling project should be created");
        sqlx::raw_sql(SCHEDULING_SCHEMA)
            .execute(&mut database)
            .await
            .expect("scheduling migration should execute on the core database");

        let value: String =
            sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'existing'")
                .fetch_one(&mut database)
                .await
                .expect("existing data should remain readable");

        assert_eq!(value, "preserved");
        let project_name: String = sqlx::query_scalar(
            "SELECT name FROM projects WHERE id = '10000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("pre-scheduling project should remain readable");
        assert_eq!(project_name, "Preservado");
    }

    #[tokio::test]
    async fn reuse_upgrade_preserves_scheduled_projects_and_tasks() {
        let mut database = in_memory_database().await;
        for schema in [INITIAL_SCHEMA, CORE_SCHEMA, SCHEDULING_SCHEMA] {
            sqlx::raw_sql(schema)
                .execute(&mut database)
                .await
                .expect("pre-reuse schema should execute");
        }
        sqlx::query(
            "INSERT INTO projects (
                id, name, status, calendar_id, position, is_archived, created_at, updated_at
             ) VALUES (
                '10000000-0000-4000-8000-000000000001', 'Preservado', 'ACTIVE',
                '00000000-0000-4000-8000-000000000001', 0, 0,
                '2026-08-29T12:00:00.000Z', '2026-08-29T12:00:00.000Z'
             )",
        )
        .execute(&mut database)
        .await
        .expect("project should exist before reuse migration");
        sqlx::query(
            "INSERT INTO tasks (
                id, project_id, title, status, priority, progress, scheduling_mode, position,
                created_at, updated_at
             ) VALUES (
                '20000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000001', 'Tarefa preservada',
                'NOT_STARTED', 'NORMAL', 0, 'AUTO', 0,
                '2026-08-29T12:00:00.000Z', '2026-08-29T12:00:00.000Z'
             )",
        )
        .execute(&mut database)
        .await
        .expect("task should exist before reuse migration");

        sqlx::raw_sql(REUSE_SCHEMA)
            .execute(&mut database)
            .await
            .expect("reuse migration should execute on schema 3");

        let project_name: String = sqlx::query_scalar(
            "SELECT name FROM projects WHERE id = '10000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("project should remain readable");
        let task_title: String = sqlx::query_scalar(
            "SELECT title FROM tasks WHERE id = '20000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("task should remain readable");
        let schema_version: String =
            sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'schema_version'")
                .fetch_one(&mut database)
                .await
                .expect("schema version should update");
        assert_eq!(project_name, "Preservado");
        assert_eq!(task_title, "Tarefa preservada");
        assert_eq!(schema_version, "4");
    }

    #[test]
    fn migration_versions_are_unique_and_ordered() {
        let registered = migrations();
        let versions: Vec<i64> = registered
            .iter()
            .map(|migration| migration.version)
            .collect();

        assert_eq!(
            versions,
            vec![1, 2, SCHEDULING_MIGRATION_VERSION, DATABASE_SCHEMA_VERSION]
        );
    }
}
