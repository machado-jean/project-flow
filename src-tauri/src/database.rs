use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:projectflow.sqlite";
pub const DATABASE_SCHEMA_VERSION: i64 = 2;

pub(crate) const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial.sql");
pub(crate) const CORE_SCHEMA: &str = include_str!("../migrations/0002_core.sql");

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create application metadata",
            sql: INITIAL_SCHEMA,
            kind: MigrationKind::Up,
        },
        Migration {
            version: DATABASE_SCHEMA_VERSION,
            description: "create project and task core",
            sql: CORE_SCHEMA,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use sqlx::{Connection, SqliteConnection};

    use super::{migrations, CORE_SCHEMA, DATABASE_SCHEMA_VERSION, INITIAL_SCHEMA};

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
        println!("SQLite runtime version: {sqlite_version}");
    }

    #[tokio::test]
    async fn core_upgrade_preserves_existing_data() {
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

        let value: String =
            sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'existing'")
                .fetch_one(&mut database)
                .await
                .expect("existing data should remain readable");

        assert_eq!(value, "preserved");
    }

    #[test]
    fn migration_versions_are_unique_and_ordered() {
        let registered = migrations();
        let versions: Vec<i64> = registered
            .iter()
            .map(|migration| migration.version)
            .collect();

        assert_eq!(versions, vec![1, DATABASE_SCHEMA_VERSION]);
    }
}
