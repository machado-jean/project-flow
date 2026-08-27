use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:projectflow.sqlite";
pub const DATABASE_SCHEMA_VERSION: i64 = 1;

const INITIAL_SCHEMA: &str = include_str!("../migrations/0001_initial.sql");

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: DATABASE_SCHEMA_VERSION,
        description: "create application metadata",
        sql: INITIAL_SCHEMA,
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use sqlx::{Connection, SqliteConnection};

    use super::{migrations, DATABASE_SCHEMA_VERSION, INITIAL_SCHEMA};

    async fn in_memory_database() -> SqliteConnection {
        SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("in-memory SQLite should open")
    }

    #[tokio::test]
    async fn initial_migration_creates_schema_metadata() {
        let mut database = in_memory_database().await;

        sqlx::raw_sql(INITIAL_SCHEMA)
            .execute(&mut database)
            .await
            .expect("initial migration should execute");

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
        println!("SQLite runtime version: {sqlite_version}");
    }

    #[tokio::test]
    async fn initial_migration_preserves_existing_unrelated_data() {
        let mut database = in_memory_database().await;

        sqlx::raw_sql(
            "CREATE TABLE existing_data (value TEXT NOT NULL); \
             INSERT INTO existing_data VALUES ('preserved');",
        )
        .execute(&mut database)
        .await
        .expect("pre-migration data should be created");

        sqlx::raw_sql(INITIAL_SCHEMA)
            .execute(&mut database)
            .await
            .expect("initial migration should execute on an existing database");

        let value: String = sqlx::query_scalar("SELECT value FROM existing_data")
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

        assert_eq!(versions, vec![DATABASE_SCHEMA_VERSION]);
    }
}
