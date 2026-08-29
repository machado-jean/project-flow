use std::{
    borrow::Cow,
    fmt,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use sqlx::{
    migrate::{Migration as SqlxMigration, MigrationType},
    sqlite::SqliteConnectOptions,
    Connection, Row, SqliteConnection,
};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

use crate::database::{
    database_backup_dir, database_path, uses_shared_development_database, CORE_SCHEMA,
    DATABASE_FILENAME, INITIAL_SCHEMA, SCHEDULING_MIGRATION_VERSION, SCHEDULING_SCHEMA,
};

const LEGACY_SUMMARY_DEPENDENCY_MESSAGE: &str = "tarefas-resumo não podem possuir dependências";
const CURRENT_SUMMARY_DEPENDENCY_MESSAGE: &str = "summary tasks cannot have dependencies";
const LEGACY_SUMMARY_CONVERSION_MESSAGE: &str =
    "uma tarefa com dependências não pode se tornar tarefa-resumo";
const CURRENT_SUMMARY_CONVERSION_MESSAGE: &str =
    "a task with dependencies cannot become a summary task";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MigrationCompatibilityOutcome {
    DatabaseNotPresent,
    AlreadyCurrent,
    Repaired { backup_path: PathBuf },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DevelopmentDatabaseOutcome {
    NotApplicable,
    AlreadyPresent,
    SourceNotPresent,
    Imported { backup_path: PathBuf },
}

#[derive(Debug)]
pub(crate) struct MigrationCompatibilityError {
    message: String,
}

impl MigrationCompatibilityError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for MigrationCompatibilityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for MigrationCompatibilityError {}

#[derive(Debug, PartialEq, Eq)]
struct SchemaEntry {
    object_type: String,
    name: String,
    table_name: String,
    sql: String,
}

pub(crate) fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("migration-compatibility")
        .setup(|app, _api| {
            let app_config_dir = app.path().app_config_dir()?;
            let target_database_path = database_path(&app_config_dir);
            let backup_dir = database_backup_dir(&app_config_dir);
            let development_outcome =
                tauri::async_runtime::block_on(prepare_shared_development_database(
                    &app_config_dir.join(DATABASE_FILENAME),
                    &target_database_path,
                    &backup_dir,
                    uses_shared_development_database(),
                ))?;
            let migration_outcome = tauri::async_runtime::block_on(repair_known_migration_drift(
                &target_database_path,
                &backup_dir,
            ))?;
            app.manage(development_outcome);
            app.manage(migration_outcome);
            Ok(())
        })
        .build()
}

pub(crate) async fn prepare_shared_development_database(
    source_database_path: &Path,
    target_database_path: &Path,
    backup_dir: &Path,
    enabled: bool,
) -> Result<DevelopmentDatabaseOutcome, MigrationCompatibilityError> {
    if !enabled {
        return Ok(DevelopmentDatabaseOutcome::NotApplicable);
    }
    if target_database_path.exists() {
        return Ok(DevelopmentDatabaseOutcome::AlreadyPresent);
    }
    if !source_database_path.exists() {
        if let Some(parent) = target_database_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                MigrationCompatibilityError::new(format!(
                    "não foi possível criar a pasta do banco de desenvolvimento {}: {error}",
                    parent.display()
                ))
            })?;
        }
        return Ok(DevelopmentDatabaseOutcome::SourceNotPresent);
    }

    let target_parent = target_database_path.parent().ok_or_else(|| {
        MigrationCompatibilityError::new(
            "o banco compartilhado de desenvolvimento não possui uma pasta válida",
        )
    })?;
    std::fs::create_dir_all(target_parent).map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível criar a pasta do banco de desenvolvimento {}: {error}",
            target_parent.display()
        ))
    })?;
    std::fs::create_dir_all(backup_dir).map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível criar a pasta de backup {}: {error}",
            backup_dir.display()
        ))
    })?;

    let timestamp = timestamp_millis()?;
    let backup_path = backup_dir.join(format!(
        "projectflow-before-shared-development-{timestamp}.sqlite"
    ));
    let backup_path_text = path_as_sqlite_text(&backup_path, "backup")?;
    let mut source = open_existing_database(source_database_path).await?;
    verify_integrity(&mut source, "banco de origem do AppData").await?;
    sqlx::query("VACUUM main INTO ?")
        .bind(backup_path_text)
        .execute(&mut source)
        .await
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível preservar o banco do AppData em {}: {error}",
                backup_path.display()
            ))
        })?;
    source.close().await.map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível fechar o banco de origem após o backup: {error}"
        ))
    })?;

    let mut backup = open_existing_database(&backup_path).await?;
    verify_integrity(&mut backup, "backup anterior ao compartilhamento").await?;
    backup.close().await.map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível fechar o backup verificado: {error}"
        ))
    })?;

    let temporary_path = target_parent.join(format!(".projectflow-importing-{timestamp}.sqlite"));
    std::fs::copy(&backup_path, &temporary_path).map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível preparar o banco compartilhado {}: {error}",
            temporary_path.display()
        ))
    })?;
    let mut imported = open_existing_database(&temporary_path).await?;
    verify_integrity(&mut imported, "cópia de desenvolvimento").await?;
    imported.close().await.map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível fechar a cópia de desenvolvimento verificada: {error}"
        ))
    })?;

    if target_database_path.exists() {
        let _ = std::fs::remove_file(&temporary_path);
        return Ok(DevelopmentDatabaseOutcome::AlreadyPresent);
    }
    std::fs::rename(&temporary_path, target_database_path).map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível ativar o banco compartilhado {}: {error}",
            target_database_path.display()
        ))
    })?;

    Ok(DevelopmentDatabaseOutcome::Imported { backup_path })
}

pub(crate) async fn repair_known_migration_drift(
    database_path: &Path,
    backup_dir: &Path,
) -> Result<MigrationCompatibilityOutcome, MigrationCompatibilityError> {
    if !database_path.exists() {
        return Ok(MigrationCompatibilityOutcome::DatabaseNotPresent);
    }

    let mut database = open_existing_database(database_path).await?;
    verify_integrity(&mut database, "banco principal").await?;

    let applied_migrations = load_applied_migrations(&mut database).await?;
    let canonical_checksum = migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA));
    let applied_scheduling_checksum = applied_migrations
        .iter()
        .find(|migration| migration.version == SCHEDULING_MIGRATION_VERSION)
        .ok_or_else(|| {
            MigrationCompatibilityError::new(format!(
                "a migration {SCHEDULING_MIGRATION_VERSION} não está registrada no banco"
            ))
        })?;

    if !applied_scheduling_checksum.success {
        return Err(MigrationCompatibilityError::new(format!(
            "a migration {SCHEDULING_MIGRATION_VERSION} está marcada como incompleta; o reparo automático foi cancelado"
        )));
    }

    if applied_scheduling_checksum.checksum == canonical_checksum {
        return Ok(MigrationCompatibilityOutcome::AlreadyCurrent);
    }

    let legacy_schema = known_legacy_scheduling_schema();
    let legacy_checksum = migration_checksum(Cow::Owned(legacy_schema.clone()));
    if applied_scheduling_checksum.checksum != legacy_checksum {
        return Err(MigrationCompatibilityError::new(format!(
            "checksum desconhecido para a migration {SCHEDULING_MIGRATION_VERSION}: {}; nenhuma alteração foi realizada",
            checksum_as_hex(&applied_scheduling_checksum.checksum)
        )));
    }

    verify_complete_migration_history(&applied_migrations, &legacy_checksum)?;
    verify_schema_matches_current(&mut database).await?;
    verify_scheduling_seed_data(&mut database).await?;

    let backup_path = create_verified_backup(&mut database, database_path, backup_dir).await?;

    let mut transaction = database.begin().await.map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível iniciar a transação de reparo: {error}"
        ))
    })?;
    let updated = sqlx::query(
        "UPDATE _sqlx_migrations \
         SET checksum = ? \
         WHERE version = ? AND checksum = ? AND success = TRUE",
    )
    .bind(&canonical_checksum)
    .bind(SCHEDULING_MIGRATION_VERSION)
    .bind(&legacy_checksum)
    .execute(&mut *transaction)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível atualizar o registro da migration: {error}"
        ))
    })?;

    if updated.rows_affected() != 1 {
        return Err(MigrationCompatibilityError::new(
            "o registro da migration mudou durante o reparo; a transação foi cancelada",
        ));
    }

    transaction.commit().await.map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível confirmar a transação de reparo: {error}"
        ))
    })?;

    let stored_checksum: Vec<u8> = sqlx::query_scalar(
        "SELECT checksum FROM _sqlx_migrations WHERE version = ? AND success = TRUE",
    )
    .bind(SCHEDULING_MIGRATION_VERSION)
    .fetch_one(&mut database)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível validar o checksum após o reparo: {error}"
        ))
    })?;
    if stored_checksum != canonical_checksum {
        return Err(MigrationCompatibilityError::new(
            "o checksum persistido não corresponde à migration atual após o reparo",
        ));
    }
    verify_integrity(&mut database, "banco reparado").await?;

    Ok(MigrationCompatibilityOutcome::Repaired { backup_path })
}

#[derive(Debug)]
struct AppliedMigration {
    version: i64,
    success: bool,
    checksum: Vec<u8>,
}

async fn open_existing_database(
    database_path: &Path,
) -> Result<SqliteConnection, MigrationCompatibilityError> {
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(false)
        .foreign_keys(true);
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível abrir o banco {}: {error}",
                database_path.display()
            ))
        })
}

async fn load_applied_migrations(
    database: &mut SqliteConnection,
) -> Result<Vec<AppliedMigration>, MigrationCompatibilityError> {
    let table_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut *database)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível localizar o histórico de migrations: {error}"
        ))
    })?;
    if table_exists != 1 {
        return Err(MigrationCompatibilityError::new(
            "o banco não possui a tabela de histórico de migrations; nenhuma alteração foi realizada",
        ));
    }

    let rows =
        sqlx::query("SELECT version, success, checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&mut *database)
            .await
            .map_err(|error| {
                MigrationCompatibilityError::new(format!(
                    "não foi possível ler o histórico de migrations: {error}"
                ))
            })?;

    rows.into_iter()
        .map(|row| {
            Ok(AppliedMigration {
                version: row.try_get("version").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "versão inválida no histórico de migrations: {error}"
                    ))
                })?,
                success: row.try_get("success").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "estado inválido no histórico de migrations: {error}"
                    ))
                })?,
                checksum: row.try_get("checksum").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "checksum inválido no histórico de migrations: {error}"
                    ))
                })?,
            })
        })
        .collect()
}

fn verify_complete_migration_history(
    applied: &[AppliedMigration],
    legacy_scheduling_checksum: &[u8],
) -> Result<(), MigrationCompatibilityError> {
    let expected = [
        (1, migration_checksum(Cow::Borrowed(INITIAL_SCHEMA))),
        (2, migration_checksum(Cow::Borrowed(CORE_SCHEMA))),
        (
            SCHEDULING_MIGRATION_VERSION,
            legacy_scheduling_checksum.to_vec(),
        ),
    ];

    if applied.len() != expected.len() {
        return Err(MigrationCompatibilityError::new(format!(
            "histórico inesperado: eram esperadas {} migrations e foram encontradas {}; nenhuma alteração foi realizada",
            expected.len(),
            applied.len()
        )));
    }

    for ((expected_version, expected_checksum), actual) in expected.iter().zip(applied) {
        if actual.version != *expected_version
            || !actual.success
            || actual.checksum != *expected_checksum
        {
            return Err(MigrationCompatibilityError::new(format!(
                "a migration {} não corresponde ao histórico compatível conhecido; nenhuma alteração foi realizada",
                actual.version
            )));
        }
    }

    Ok(())
}

async fn verify_integrity(
    database: &mut SqliteConnection,
    label: &str,
) -> Result<(), MigrationCompatibilityError> {
    let results: Vec<String> = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_all(database)
        .await
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível verificar a integridade do {label}: {error}"
            ))
        })?;
    if results.len() != 1 || results[0] != "ok" {
        return Err(MigrationCompatibilityError::new(format!(
            "a verificação de integridade do {label} falhou: {}",
            results.join("; ")
        )));
    }
    Ok(())
}

async fn verify_schema_matches_current(
    database: &mut SqliteConnection,
) -> Result<(), MigrationCompatibilityError> {
    let actual = load_schema(database).await?;
    let mut reference = SqliteConnection::connect("sqlite::memory:")
        .await
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível criar a referência de schema: {error}"
            ))
        })?;
    for (label, sql) in [
        ("migration 1", INITIAL_SCHEMA),
        ("migration 2", CORE_SCHEMA),
        ("migration 3", SCHEDULING_SCHEMA),
    ] {
        sqlx::raw_sql(sql)
            .execute(&mut reference)
            .await
            .map_err(|error| {
                MigrationCompatibilityError::new(format!(
                    "não foi possível montar a referência da {label}: {error}"
                ))
            })?;
    }
    let expected = load_schema(&mut reference).await?;

    if actual != expected {
        return Err(MigrationCompatibilityError::new(
            "o schema do banco não corresponde à migration 3 conhecida; nenhuma alteração foi realizada",
        ));
    }
    Ok(())
}

async fn load_schema(
    database: &mut SqliteConnection,
) -> Result<Vec<SchemaEntry>, MigrationCompatibilityError> {
    let rows = sqlx::query(
        "SELECT type, name, tbl_name, COALESCE(sql, '') AS sql \
         FROM sqlite_master \
         WHERE name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations' \
         ORDER BY type, name",
    )
    .fetch_all(database)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível inspecionar o schema SQLite: {error}"
        ))
    })?;

    rows.into_iter()
        .map(|row| {
            let sql: String = row.try_get("sql").map_err(|error| {
                MigrationCompatibilityError::new(format!(
                    "definição inválida no schema SQLite: {error}"
                ))
            })?;
            Ok(SchemaEntry {
                object_type: row.try_get("type").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "tipo inválido no schema SQLite: {error}"
                    ))
                })?,
                name: row.try_get("name").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "nome inválido no schema SQLite: {error}"
                    ))
                })?,
                table_name: row.try_get("tbl_name").map_err(|error| {
                    MigrationCompatibilityError::new(format!(
                        "tabela inválida no schema SQLite: {error}"
                    ))
                })?,
                sql: normalize_schema_sql(&sql),
            })
        })
        .collect()
}

fn normalize_schema_sql(sql: &str) -> String {
    sql.replace(
        LEGACY_SUMMARY_DEPENDENCY_MESSAGE,
        CURRENT_SUMMARY_DEPENDENCY_MESSAGE,
    )
    .replace(
        LEGACY_SUMMARY_CONVERSION_MESSAGE,
        CURRENT_SUMMARY_CONVERSION_MESSAGE,
    )
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

async fn verify_scheduling_seed_data(
    database: &mut SqliteConnection,
) -> Result<(), MigrationCompatibilityError> {
    let schema_version: Option<String> =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'schema_version'")
            .fetch_optional(&mut *database)
            .await
            .map_err(|error| {
                MigrationCompatibilityError::new(format!(
                    "não foi possível validar a versão do schema: {error}"
                ))
            })?;
    if schema_version.as_deref() != Some("3") {
        return Err(MigrationCompatibilityError::new(
            "a versão lógica do schema não é 3; nenhuma alteração foi realizada",
        ));
    }

    let continuous_working_days: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM calendar_working_days \
         WHERE calendar_id = '00000000-0000-4000-8000-000000000002' \
         AND weekday BETWEEN 1 AND 7",
    )
    .fetch_one(database)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível validar o calendário contínuo: {error}"
        ))
    })?;
    if continuous_working_days != 7 {
        return Err(MigrationCompatibilityError::new(
            "o calendário contínuo da migration 3 está incompleto; nenhuma alteração foi realizada",
        ));
    }
    Ok(())
}

async fn create_verified_backup(
    database: &mut SqliteConnection,
    database_path: &Path,
    backup_dir: &Path,
) -> Result<PathBuf, MigrationCompatibilityError> {
    std::fs::create_dir_all(backup_dir).map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível criar a pasta de backup {}: {error}",
            backup_dir.display()
        ))
    })?;
    let timestamp = timestamp_millis()?;
    let stem = database_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("projectflow");
    let backup_path = backup_dir.join(format!(
        "{stem}-before-migration-{SCHEDULING_MIGRATION_VERSION}-repair-{timestamp}.sqlite"
    ));
    let backup_path_text = path_as_sqlite_text(&backup_path, "backup")?;

    sqlx::query("VACUUM main INTO ?")
        .bind(backup_path_text)
        .execute(&mut *database)
        .await
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível criar o backup SQLite {}: {error}",
                backup_path.display()
            ))
        })?;

    let mut backup = open_existing_database(&backup_path).await?;
    verify_integrity(&mut backup, "backup").await?;
    let backup_migration_checksum: Vec<u8> = sqlx::query_scalar(
        "SELECT checksum FROM _sqlx_migrations WHERE version = ? AND success = TRUE",
    )
    .bind(SCHEDULING_MIGRATION_VERSION)
    .fetch_one(&mut backup)
    .await
    .map_err(|error| {
        MigrationCompatibilityError::new(format!(
            "não foi possível validar o histórico do backup: {error}"
        ))
    })?;
    if backup_migration_checksum != migration_checksum(Cow::Owned(known_legacy_scheduling_schema()))
    {
        return Err(MigrationCompatibilityError::new(
            "o backup não preservou o checksum anterior; o reparo foi cancelado",
        ));
    }

    Ok(backup_path)
}

fn timestamp_millis() -> Result<u128, MigrationCompatibilityError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            MigrationCompatibilityError::new(format!(
                "não foi possível gerar o identificador do backup: {error}"
            ))
        })
        .map(|duration| duration.as_millis())
}

fn path_as_sqlite_text<'a>(
    path: &'a Path,
    label: &str,
) -> Result<&'a str, MigrationCompatibilityError> {
    path.to_str().ok_or_else(|| {
        MigrationCompatibilityError::new(format!(
            "o caminho do {label} contém caracteres que o SQLite não conseguiu representar"
        ))
    })
}

fn known_legacy_scheduling_schema() -> String {
    SCHEDULING_SCHEMA
        .replace(
            CURRENT_SUMMARY_DEPENDENCY_MESSAGE,
            LEGACY_SUMMARY_DEPENDENCY_MESSAGE,
        )
        .replace(
            CURRENT_SUMMARY_CONVERSION_MESSAGE,
            LEGACY_SUMMARY_CONVERSION_MESSAGE,
        )
}

fn migration_checksum(sql: Cow<'static, str>) -> Vec<u8> {
    SqlxMigration::new(
        SCHEDULING_MIGRATION_VERSION,
        Cow::Borrowed("ProjectFlow migration compatibility"),
        MigrationType::Simple,
        sql,
        false,
    )
    .checksum
    .into_owned()
}

fn checksum_as_hex(checksum: &[u8]) -> String {
    checksum.iter().map(|byte| format!("{byte:02X}")).collect()
}

#[cfg(test)]
mod tests {
    use std::{borrow::Cow, path::Path, time::SystemTime};

    use sqlx::{Connection, SqliteConnection};

    use super::{
        checksum_as_hex, known_legacy_scheduling_schema, migration_checksum,
        prepare_shared_development_database, repair_known_migration_drift,
        DevelopmentDatabaseOutcome, MigrationCompatibilityOutcome,
    };
    use crate::database::{CORE_SCHEMA, INITIAL_SCHEMA, SCHEDULING_SCHEMA};

    const MIGRATIONS_TABLE: &str = r#"
        CREATE TABLE _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );
    "#;

    struct TestWorkspace {
        root: std::path::PathBuf,
        database: std::path::PathBuf,
        backups: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new(label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("test clock should be after the Unix epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "projectflow-migration-compatibility-{label}-{}-{unique}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).expect("test workspace should be created");
            Self {
                database: root.join("projectflow.sqlite"),
                backups: root.join("backups"),
                root,
            }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    async fn create_database(path: &Path, scheduling_schema: &str, scheduling_checksum: Vec<u8>) {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true);
        let mut database = SqliteConnection::connect_with(&options)
            .await
            .expect("test database should open");
        sqlx::raw_sql(MIGRATIONS_TABLE)
            .execute(&mut database)
            .await
            .expect("migration table should be created");

        for (version, description, schema, checksum) in [
            (
                1_i64,
                "create application metadata",
                INITIAL_SCHEMA,
                migration_checksum(Cow::Borrowed(INITIAL_SCHEMA)),
            ),
            (
                2_i64,
                "create project and task core",
                CORE_SCHEMA,
                migration_checksum(Cow::Borrowed(CORE_SCHEMA)),
            ),
            (
                3_i64,
                "add calendars and FS scheduling",
                scheduling_schema,
                scheduling_checksum,
            ),
        ] {
            sqlx::raw_sql(schema)
                .execute(&mut database)
                .await
                .expect("test migration should execute");
            sqlx::query(
                "INSERT INTO _sqlx_migrations \
                 (version, description, success, checksum, execution_time) \
                 VALUES (?, ?, TRUE, ?, 1)",
            )
            .bind(version)
            .bind(description)
            .bind(checksum)
            .execute(&mut database)
            .await
            .expect("migration history should be recorded");
        }
    }

    async fn insert_business_data(path: &Path) {
        let mut database = super::open_existing_database(path)
            .await
            .expect("test database should reopen");
        sqlx::query(
            "INSERT INTO projects (
                id, name, status, calendar_id, position, is_archived, created_at, updated_at
             ) VALUES (
                '10000000-0000-4000-8000-000000000001', 'Projeto preservado', 'ACTIVE',
                '00000000-0000-4000-8000-000000000001', 0, 0,
                '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00.000Z'
             )",
        )
        .execute(&mut database)
        .await
        .expect("project should be inserted");
        sqlx::query(
            "INSERT INTO tasks (
                id, project_id, title, status, priority, progress, start_date, end_date,
                duration_days, scheduling_mode, position, created_at, updated_at
             ) VALUES (
                '20000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000001', 'Tarefa preservada',
                'NOT_STARTED', 'NORMAL', 0, '2026-08-28', '2026-08-28', 1,
                'AUTO', 0, '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00.000Z'
             )",
        )
        .execute(&mut database)
        .await
        .expect("task should be inserted");
    }

    async fn stored_checksum(path: &Path) -> Vec<u8> {
        let mut database = super::open_existing_database(path)
            .await
            .expect("test database should reopen");
        sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = 3")
            .fetch_one(&mut database)
            .await
            .expect("scheduling checksum should exist")
    }

    async fn business_data(path: &Path) -> (String, String) {
        let mut database = super::open_existing_database(path)
            .await
            .expect("test database should reopen");
        let project: String = sqlx::query_scalar(
            "SELECT name FROM projects WHERE id = '10000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("project should remain readable");
        let task: String = sqlx::query_scalar(
            "SELECT title FROM tasks WHERE id = '20000000-0000-4000-8000-000000000001'",
        )
        .fetch_one(&mut database)
        .await
        .expect("task should remain readable");
        (project, task)
    }

    #[test]
    fn known_checksums_match_the_published_files() {
        assert_eq!(
            checksum_as_hex(&migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA))),
            "1617ADF38E69528743AE170C2D96C1544E5FE4E1C43784C104DAA8F1089FAB098DFF734928DBD6A76663CCB5D3926AA2"
        );
        assert_eq!(
            checksum_as_hex(&migration_checksum(Cow::Owned(
                known_legacy_scheduling_schema()
            ))),
            "B0235D131954F693E45862FBDCFE8CB773D61E059058DB8CC3D8985D0786F8BB53C9B2EBB1A5E8162B1D95ED0553EA35"
        );
    }

    #[tokio::test]
    async fn imports_app_data_into_shared_development_database_with_verified_backup() {
        let workspace = TestWorkspace::new("shared-development-import");
        let target = workspace.root.join("data").join("projectflow.sqlite");
        create_database(
            &workspace.database,
            SCHEDULING_SCHEMA,
            migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA)),
        )
        .await;
        insert_business_data(&workspace.database).await;

        let outcome = prepare_shared_development_database(
            &workspace.database,
            &target,
            &workspace.backups,
            true,
        )
        .await
        .expect("shared development database should be imported");
        let DevelopmentDatabaseOutcome::Imported { backup_path } = outcome else {
            panic!("first shared development initialization should import AppData");
        };

        assert!(target.exists());
        assert!(backup_path.exists());
        assert_eq!(
            business_data(&workspace.database).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
        assert_eq!(
            business_data(&backup_path).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
        assert_eq!(
            business_data(&target).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
    }

    #[tokio::test]
    async fn never_overwrites_an_existing_shared_development_database() {
        let workspace = TestWorkspace::new("shared-development-existing");
        let source = workspace.root.join("source.sqlite");
        create_database(
            &source,
            SCHEDULING_SCHEMA,
            migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA)),
        )
        .await;
        create_database(
            &workspace.database,
            SCHEDULING_SCHEMA,
            migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA)),
        )
        .await;
        insert_business_data(&workspace.database).await;

        let outcome = prepare_shared_development_database(
            &source,
            &workspace.database,
            &workspace.backups,
            true,
        )
        .await
        .expect("existing shared database should be retained");

        assert_eq!(outcome, DevelopmentDatabaseOutcome::AlreadyPresent);
        assert_eq!(
            business_data(&workspace.database).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
        assert!(!workspace.backups.exists());
    }

    #[tokio::test]
    async fn repairs_only_the_known_checksum_and_preserves_data_in_database_and_backup() {
        let workspace = TestWorkspace::new("known");
        let legacy_schema = known_legacy_scheduling_schema();
        let legacy_checksum = migration_checksum(Cow::Owned(legacy_schema.clone()));
        create_database(&workspace.database, &legacy_schema, legacy_checksum.clone()).await;
        insert_business_data(&workspace.database).await;

        let outcome = repair_known_migration_drift(&workspace.database, &workspace.backups)
            .await
            .expect("known drift should be repaired");
        let MigrationCompatibilityOutcome::Repaired { backup_path } = outcome else {
            panic!("known drift should report a repair");
        };

        assert!(backup_path.exists());
        assert_eq!(
            stored_checksum(&workspace.database).await,
            migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA))
        );
        assert_eq!(stored_checksum(&backup_path).await, legacy_checksum);
        assert_eq!(
            business_data(&workspace.database).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
        assert_eq!(
            business_data(&backup_path).await,
            ("Projeto preservado".into(), "Tarefa preservada".into())
        );
    }

    #[tokio::test]
    async fn current_checksum_is_left_untouched_without_creating_a_backup() {
        let workspace = TestWorkspace::new("current");
        let canonical = migration_checksum(Cow::Borrowed(SCHEDULING_SCHEMA));
        create_database(&workspace.database, SCHEDULING_SCHEMA, canonical.clone()).await;

        let outcome = repair_known_migration_drift(&workspace.database, &workspace.backups)
            .await
            .expect("current database should be accepted");

        assert_eq!(outcome, MigrationCompatibilityOutcome::AlreadyCurrent);
        assert_eq!(stored_checksum(&workspace.database).await, canonical);
        assert!(!workspace.backups.exists());
    }

    #[tokio::test]
    async fn unknown_checksum_fails_closed_without_creating_a_backup() {
        let workspace = TestWorkspace::new("unknown");
        let legacy_schema = known_legacy_scheduling_schema();
        create_database(&workspace.database, &legacy_schema, vec![0_u8; 48]).await;

        let error = repair_known_migration_drift(&workspace.database, &workspace.backups)
            .await
            .expect_err("unknown drift should be rejected");

        assert!(error.to_string().contains("checksum desconhecido"));
        assert_eq!(stored_checksum(&workspace.database).await, vec![0_u8; 48]);
        assert!(!workspace.backups.exists());
    }

    #[tokio::test]
    async fn schema_mismatch_fails_closed_before_backup_or_metadata_change() {
        let workspace = TestWorkspace::new("schema");
        let legacy_schema = known_legacy_scheduling_schema();
        let legacy_checksum = migration_checksum(Cow::Owned(legacy_schema.clone()));
        create_database(&workspace.database, &legacy_schema, legacy_checksum.clone()).await;
        let mut database = super::open_existing_database(&workspace.database)
            .await
            .expect("test database should reopen");
        sqlx::query("DROP TRIGGER task_dependencies_require_leaf_tasks")
            .execute(&mut database)
            .await
            .expect("test should alter the schema");
        database.close().await.expect("test database should close");

        let error = repair_known_migration_drift(&workspace.database, &workspace.backups)
            .await
            .expect_err("unknown schema should be rejected");

        assert!(error
            .to_string()
            .contains("schema do banco não corresponde"));
        assert_eq!(stored_checksum(&workspace.database).await, legacy_checksum);
        assert!(!workspace.backups.exists());
    }
}
