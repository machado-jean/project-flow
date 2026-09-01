use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
    thread,
    time::Duration,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteConnectOptions, Connection, SqliteConnection, SqlitePool};
use tauri_plugin_log::log::info;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::{
    database::DATABASE_SCHEMA_VERSION,
    persistence::{
        self, CalendarRecord, DependencyRecord, ProjectRecord, TaskRecord,
        TaskTemplateBundleRecord, WorkspaceData,
    },
};

const FORMAT_NAME: &str = "projectflow";
const FORMAT_VERSION: u32 = 1;
const MAX_PACKAGE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DATA_BYTES: u64 = 500 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_README_BYTES: u64 = 64 * 1024;
const MANIFEST_ENTRY: &str = "manifest.json";
const DATA_ENTRY: &str = "data.sqlite";
const README_ENTRY: &str = "README.txt";

type PortabilityResult<T> = Result<T, String>;

fn rename_after_validation(source: &Path, destination: &Path) -> std::io::Result<()> {
    const MAX_ATTEMPTS: u64 = 24;
    for attempt in 0..MAX_ATTEMPTS {
        match fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error)
                if matches!(error.raw_os_error(), Some(5 | 32)) && attempt + 1 < MAX_ATTEMPTS =>
            {
                // WebView2, SQLite or antivirus scanning can briefly retain the
                // validated file on Windows. Retry only sharing/access errors,
                // with a bounded delay, so permanent failures still surface.
                thread::sleep(Duration::from_millis(50 * (attempt + 1).min(5)));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("the retry loop always returns on its final attempt")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageManifest {
    format: String,
    format_version: u32,
    schema_version: i64,
    app_version: String,
    export_type: ExportType,
    exported_at: String,
    data_sha256: String,
    data_size: u64,
    projects: Vec<ProjectCatalogEntry>,
    templates: Vec<TemplateCatalogEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportType {
    Project,
    Workspace,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectCatalogEntry {
    id: String,
    name: String,
    updated_at: String,
    task_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TemplateCatalogEntry {
    id: String,
    name: String,
    updated_at: String,
    item_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPackagePreview {
    pub package_path: String,
    pub export_type: ExportType,
    pub exported_at: String,
    pub schema_version: i64,
    pub projects: Vec<ImportProjectPreview>,
    pub templates: Vec<ImportTemplatePreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProjectPreview {
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub task_count: usize,
    pub exists_locally: bool,
    pub local_updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTemplatePreview {
    pub id: String,
    pub name: String,
    pub updated_at: String,
    pub item_count: usize,
    pub exists_locally: bool,
    pub local_updated_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProjectImportMode {
    Replace,
    Copy,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectImportSelection {
    pub project_id: String,
    pub mode: ProjectImportMode,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportSelection {
    #[serde(default)]
    pub projects: Vec<ProjectImportSelection>,
    #[serde(default)]
    pub template_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub project_count: usize,
    pub template_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub backup_path: String,
    pub imported_project_count: usize,
    pub copied_project_count: usize,
    pub imported_template_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub safety_backup_path: String,
    pub project_count: usize,
    pub template_count: usize,
}

struct StagingDirectory(PathBuf);

impl StagingDirectory {
    fn create(parent: &Path) -> PortabilityResult<Self> {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Falha ao preparar staging: {error}"))?;
        let path = parent.join(format!("projectflow-{}", Uuid::new_v4()));
        fs::create_dir(&path).map_err(|error| format!("Falha ao criar staging: {error}"))?;
        Ok(Self(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct ValidatedPackage {
    manifest: PackageManifest,
    _staging: StagingDirectory,
    workspace: WorkspaceData,
}

pub async fn export_workspace(
    pool: &SqlitePool,
    destination: &Path,
    staging_parent: &Path,
) -> PortabilityResult<ExportResult> {
    export_package(pool, None, destination, staging_parent).await
}

pub async fn export_project(
    pool: &SqlitePool,
    project_id: &str,
    destination: &Path,
    staging_parent: &Path,
) -> PortabilityResult<ExportResult> {
    export_package(pool, Some(project_id), destination, staging_parent).await
}

async fn export_package(
    pool: &SqlitePool,
    project_id: Option<&str>,
    destination: &Path,
    staging_parent: &Path,
) -> PortabilityResult<ExportResult> {
    let staging = StagingDirectory::create(staging_parent)?;
    let database_path = staging.path().join(DATA_ENTRY);
    vacuum_into(pool, &database_path).await?;

    if let Some(project_id) = project_id {
        filter_database_to_project(&database_path, project_id).await?;
    }

    let workspace = load_validated_database(&database_path).await?;
    validate_workspace_graphs(&workspace)?;
    if project_id.is_some() && workspace.projects.len() != 1 {
        return Err("O projeto solicitado não existe no workspace.".into());
    }
    let export_type = if project_id.is_some() {
        ExportType::Project
    } else {
        ExportType::Workspace
    };
    let manifest = build_manifest(&database_path, &workspace, export_type)?;
    write_package(destination, &database_path, &manifest)?;
    info!(
        "ProjectFlow {:?} package exported with {} projects and {} templates",
        export_type,
        workspace.projects.len(),
        workspace.templates.len()
    );
    Ok(ExportResult {
        path: destination.to_string_lossy().into_owned(),
        project_count: workspace.projects.len(),
        template_count: workspace.templates.len(),
    })
}

pub async fn inspect_package(
    pool: &SqlitePool,
    package_path: &Path,
    staging_parent: &Path,
) -> PortabilityResult<ImportPackagePreview> {
    let package = validate_package(package_path, staging_parent).await?;
    let local = persistence::load_workspace(pool)
        .await
        .map_err(|error| format!("Falha ao consultar o workspace local: {error}"))?;
    let local_projects: HashMap<_, _> = local
        .projects
        .iter()
        .map(|project| (project.id.as_str(), project.updated_at.as_str()))
        .collect();
    let local_templates: HashMap<_, _> = local
        .templates
        .iter()
        .map(|template| (template.id.as_str(), template.updated_at.as_str()))
        .collect();

    Ok(ImportPackagePreview {
        package_path: package_path.to_string_lossy().into_owned(),
        export_type: package.manifest.export_type,
        exported_at: package.manifest.exported_at,
        schema_version: package.manifest.schema_version,
        projects: package
            .manifest
            .projects
            .into_iter()
            .map(|project| ImportProjectPreview {
                exists_locally: local_projects.contains_key(project.id.as_str()),
                local_updated_at: local_projects
                    .get(project.id.as_str())
                    .map(|value| (*value).into()),
                id: project.id,
                name: project.name,
                updated_at: project.updated_at,
                task_count: project.task_count,
            })
            .collect(),
        templates: package
            .manifest
            .templates
            .into_iter()
            .map(|template| ImportTemplatePreview {
                exists_locally: local_templates.contains_key(template.id.as_str()),
                local_updated_at: local_templates
                    .get(template.id.as_str())
                    .map(|value| (*value).into()),
                id: template.id,
                name: template.name,
                updated_at: template.updated_at,
                item_count: template.item_count,
            })
            .collect(),
    })
}

pub async fn import_package(
    pool: &SqlitePool,
    package_path: &Path,
    staging_parent: &Path,
    backup_dir: &Path,
    selection: &ImportSelection,
) -> PortabilityResult<ImportResult> {
    if selection.projects.is_empty() && selection.template_ids.is_empty() {
        return Err("Selecione ao menos um projeto ou template para importar.".into());
    }
    reject_duplicate_selections(selection)?;
    let package = validate_package(package_path, staging_parent).await?;
    validate_selection(&package.workspace, selection)?;
    let backup = create_backup(pool, backup_dir, "antes-importacao").await?;
    let local = persistence::load_workspace(pool)
        .await
        .map_err(|error| format!("Falha ao consultar o workspace local: {error}"))?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Falha ao iniciar a importação: {error}"))?;
    let now = Utc::now().to_rfc3339();
    let mut next_position = local
        .projects
        .iter()
        .map(|project| project.position)
        .max()
        .unwrap_or(-1)
        + 1;
    let mut imported = 0;
    let mut copied = 0;
    let mut calendar_map = HashMap::new();

    for selected in &selection.projects {
        let project = package
            .workspace
            .projects
            .iter()
            .find(|project| project.id == selected.project_id)
            .expect("selection was validated");
        let source_tasks: Vec<_> = package
            .workspace
            .tasks
            .iter()
            .filter(|task| task.project_id == project.id)
            .cloned()
            .collect();
        let source_dependencies: Vec<_> = package
            .workspace
            .dependencies
            .iter()
            .filter(|dependency| dependency.project_id == project.id)
            .cloned()
            .collect();

        let (mut target_project, mut target_tasks, mut target_dependencies) = match selected.mode {
            ProjectImportMode::Replace => {
                let existing_position = local
                    .projects
                    .iter()
                    .find(|local_project| local_project.id == project.id)
                    .map(|local_project| local_project.position);
                sqlx::query("DELETE FROM projects WHERE id = ?")
                    .bind(&project.id)
                    .execute(&mut *transaction)
                    .await
                    .map_err(|error| format!("Falha ao substituir o projeto: {error}"))?;
                let mut target = project.clone();
                target.position = existing_position.unwrap_or_else(|| {
                    let position = next_position;
                    next_position += 1;
                    position
                });
                imported += 1;
                (target, source_tasks, source_dependencies)
            }
            ProjectImportMode::Copy => {
                copied += 1;
                remap_project(
                    project,
                    &source_tasks,
                    &source_dependencies,
                    next_position,
                    &now,
                )
            }
        };

        import_required_calendars(
            &mut transaction,
            &local,
            &package.workspace,
            &target_project,
            &target_tasks,
            &now,
            &mut calendar_map,
        )
        .await?;
        remap_calendars(&mut target_project, &mut target_tasks, &calendar_map);
        ensure_no_foreign_id_collisions(
            &mut transaction,
            &target_project,
            &target_tasks,
            &target_dependencies,
        )
        .await?;
        persistence::save_project_record(&mut transaction, &target_project)
            .await
            .map_err(|error| format!("Falha ao importar projeto: {error}"))?;
        for task in parent_first_tasks(&target_tasks)? {
            persistence::save_task_record(&mut transaction, task)
                .await
                .map_err(|error| format!("Falha ao importar tarefa: {error}"))?;
        }
        for dependency in &mut target_dependencies {
            persistence::save_dependency_record(&mut transaction, dependency)
                .await
                .map_err(|error| format!("Falha ao importar dependência: {error}"))?;
        }
        if selected.mode == ProjectImportMode::Copy {
            next_position += 1;
        }
    }

    for template_id in &selection.template_ids {
        let bundle = template_bundle(&package.workspace, template_id)?;
        sqlx::query("DELETE FROM task_templates WHERE id = ?")
            .bind(template_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Falha ao substituir template: {error}"))?;
        persistence::save_template_bundle_record(&mut transaction, &bundle)
            .await
            .map_err(|error| format!("Falha ao importar template: {error}"))?;
    }
    persistence::cleanup_orphan_tags(&mut transaction)
        .await
        .map_err(|error| format!("Falha ao finalizar importação: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("A importação foi cancelada sem alterações: {error}"))?;

    info!(
        "ProjectFlow package imported: {} replaced/new projects, {} copied projects and {} templates",
        imported,
        copied,
        selection.template_ids.len()
    );

    Ok(ImportResult {
        backup_path: backup.path,
        imported_project_count: imported,
        copied_project_count: copied,
        imported_template_count: selection.template_ids.len(),
    })
}

pub async fn create_backup(
    pool: &SqlitePool,
    backup_dir: &Path,
    label: &str,
) -> PortabilityResult<BackupResult> {
    fs::create_dir_all(backup_dir)
        .map_err(|error| format!("Falha ao criar a pasta de backups: {error}"))?;
    let safe_label: String = label
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect();
    let filename = format!(
        "projectflow-{}-{}-{}.sqlite",
        safe_label,
        Utc::now().format("%Y%m%d-%H%M%S"),
        &Uuid::new_v4().to_string()[..8]
    );
    let path = backup_dir.join(filename);
    create_backup_at(pool, &path).await
}

pub async fn create_backup_at(
    pool: &SqlitePool,
    destination: &Path,
) -> PortabilityResult<BackupResult> {
    let parent = destination
        .parent()
        .ok_or_else(|| "O destino do backup não possui uma pasta válida.".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Falha ao criar a pasta de backups: {error}"))?;
    let temporary = parent.join(format!("projectflow-backup-{}.tmp", Uuid::new_v4()));
    vacuum_into(pool, &temporary).await?;
    if let Err(error) = load_validated_database(&temporary).await {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_file(destination).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("Falha ao substituir o backup confirmado pelo usuário: {error}")
        })?;
    }
    rename_after_validation(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Falha ao publicar o backup verificado: {error}")
    })?;
    info!("Verified ProjectFlow backup created");
    Ok(BackupResult {
        path: destination.to_string_lossy().into_owned(),
    })
}

pub async fn inspect_backup(path: &Path) -> PortabilityResult<ImportPackagePreview> {
    let workspace = load_validated_database(path).await?;
    validate_workspace_graphs(&workspace)?;
    Ok(ImportPackagePreview {
        package_path: path.to_string_lossy().into_owned(),
        export_type: ExportType::Workspace,
        exported_at: fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .map(chrono::DateTime::<Utc>::from)
            .map(|date| date.to_rfc3339())
            .unwrap_or_default(),
        schema_version: DATABASE_SCHEMA_VERSION,
        projects: project_catalog(&workspace)
            .into_iter()
            .map(|project| ImportProjectPreview {
                id: project.id,
                name: project.name,
                updated_at: project.updated_at,
                task_count: project.task_count,
                exists_locally: false,
                local_updated_at: None,
            })
            .collect(),
        templates: template_catalog(&workspace)
            .into_iter()
            .map(|template| ImportTemplatePreview {
                id: template.id,
                name: template.name,
                updated_at: template.updated_at,
                item_count: template.item_count,
                exists_locally: false,
                local_updated_at: None,
            })
            .collect(),
    })
}

pub async fn restore_backup(
    pool: &SqlitePool,
    backup_path: &Path,
    backup_dir: &Path,
) -> PortabilityResult<RestoreResult> {
    let source = load_validated_database(backup_path).await?;
    validate_workspace_graphs(&source)?;
    let safety = create_backup(pool, backup_dir, "antes-restauracao").await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Falha ao iniciar restauração: {error}"))?;
    sqlx::query("DELETE FROM projects")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Falha ao limpar projetos: {error}"))?;
    sqlx::query("DELETE FROM task_templates")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Falha ao limpar templates: {error}"))?;
    sqlx::query("DELETE FROM calendars")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Falha ao limpar calendários: {error}"))?;
    for calendar in &source.calendars {
        persistence::save_calendar_record(&mut transaction, calendar)
            .await
            .map_err(|error| format!("Falha ao restaurar calendário: {error}"))?;
    }
    for project in &source.projects {
        persistence::save_project_record(&mut transaction, project)
            .await
            .map_err(|error| format!("Falha ao restaurar projeto: {error}"))?;
        let tasks: Vec<_> = source
            .tasks
            .iter()
            .filter(|task| task.project_id == project.id)
            .cloned()
            .collect();
        for task in parent_first_tasks(&tasks)? {
            persistence::save_task_record(&mut transaction, task)
                .await
                .map_err(|error| format!("Falha ao restaurar tarefa: {error}"))?;
        }
    }
    for dependency in &source.dependencies {
        persistence::save_dependency_record(&mut transaction, dependency)
            .await
            .map_err(|error| format!("Falha ao restaurar dependência: {error}"))?;
    }
    for template in &source.templates {
        let bundle = template_bundle(&source, &template.id)?;
        persistence::save_template_bundle_record(&mut transaction, &bundle)
            .await
            .map_err(|error| format!("Falha ao restaurar template: {error}"))?;
    }
    persistence::cleanup_orphan_tags(&mut transaction)
        .await
        .map_err(|error| format!("Falha ao finalizar restauração: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("A restauração foi cancelada sem alterações: {error}"))?;
    info!(
        "ProjectFlow workspace restored with {} projects and {} templates",
        source.projects.len(),
        source.templates.len()
    );
    Ok(RestoreResult {
        safety_backup_path: safety.path,
        project_count: source.projects.len(),
        template_count: source.templates.len(),
    })
}

async fn vacuum_into(pool: &SqlitePool, destination: &Path) -> PortabilityResult<()> {
    if destination.exists() {
        return Err(format!(
            "O arquivo de destino já existe: {}",
            destination.display()
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Falha ao preparar o destino: {error}"))?;
    }
    sqlx::query("VACUUM INTO ?")
        .bind(destination.to_string_lossy().into_owned())
        .execute(pool)
        .await
        .map_err(|error| format!("Falha ao criar snapshot consistente: {error}"))?;
    Ok(())
}

async fn filter_database_to_project(path: &Path, project_id: &str) -> PortabilityResult<()> {
    let mut connection = open_connection(path, false).await?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_one(&mut connection)
        .await
        .map_err(|error| format!("Falha ao localizar projeto: {error}"))?;
    if exists != 1 {
        return Err("O projeto solicitado não existe.".into());
    }
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("Falha ao preparar exportação: {error}"))?;
    sqlx::query("DELETE FROM projects WHERE id <> ?")
        .bind(project_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Falha ao isolar projeto: {error}"))?;
    sqlx::query("DELETE FROM task_templates")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Falha ao isolar projeto: {error}"))?;
    sqlx::query(
        "DELETE FROM calendars WHERE id NOT IN (
            SELECT calendar_id FROM projects
            UNION SELECT calendar_id FROM tasks WHERE calendar_id IS NOT NULL
        )",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Falha ao isolar calendários: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Falha ao concluir snapshot: {error}"))?;
    Ok(())
}

fn build_manifest(
    database_path: &Path,
    workspace: &WorkspaceData,
    export_type: ExportType,
) -> PortabilityResult<PackageManifest> {
    let data_size = fs::metadata(database_path)
        .map_err(|error| format!("Falha ao medir o banco exportado: {error}"))?
        .len();
    if data_size > MAX_DATA_BYTES {
        return Err("O banco excede o limite de 500 MiB para exportação.".into());
    }
    Ok(PackageManifest {
        format: FORMAT_NAME.into(),
        format_version: FORMAT_VERSION,
        schema_version: DATABASE_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").into(),
        export_type,
        exported_at: Utc::now().to_rfc3339(),
        data_sha256: sha256_file(database_path)?,
        data_size,
        projects: project_catalog(workspace),
        templates: template_catalog(workspace),
    })
}

fn project_catalog(workspace: &WorkspaceData) -> Vec<ProjectCatalogEntry> {
    workspace
        .projects
        .iter()
        .map(|project| ProjectCatalogEntry {
            id: project.id.clone(),
            name: project.name.clone(),
            updated_at: project.updated_at.clone(),
            task_count: workspace
                .tasks
                .iter()
                .filter(|task| task.project_id == project.id)
                .count(),
        })
        .collect()
}

fn template_catalog(workspace: &WorkspaceData) -> Vec<TemplateCatalogEntry> {
    workspace
        .templates
        .iter()
        .map(|template| TemplateCatalogEntry {
            id: template.id.clone(),
            name: template.name.clone(),
            updated_at: template.updated_at.clone(),
            item_count: workspace
                .template_items
                .iter()
                .filter(|item| item.template_id == template.id)
                .count(),
        })
        .collect()
}

fn write_package(
    destination: &Path,
    database_path: &Path,
    manifest: &PackageManifest,
) -> PortabilityResult<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Falha ao preparar destino: {error}"))?;
    }
    let temporary = destination.with_extension(format!("projectflow.tmp-{}", Uuid::new_v4()));
    let file = File::create(&temporary)
        .map_err(|error| format!("Falha ao criar pacote temporário: {error}"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    writer
        .start_file(MANIFEST_ENTRY, options)
        .map_err(|error| format!("Falha ao criar manifest: {error}"))?;
    let manifest_json = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("Falha ao serializar manifest: {error}"))?;
    writer
        .write_all(&manifest_json)
        .map_err(|error| format!("Falha ao gravar manifest: {error}"))?;
    writer
        .start_file(DATA_ENTRY, options)
        .map_err(|error| format!("Falha ao incluir banco: {error}"))?;
    let mut database =
        File::open(database_path).map_err(|error| format!("Falha ao abrir snapshot: {error}"))?;
    std::io::copy(&mut database, &mut writer)
        .map_err(|error| format!("Falha ao copiar snapshot: {error}"))?;
    writer
        .start_file(README_ENTRY, options)
        .map_err(|error| format!("Falha ao incluir instruções: {error}"))?;
    writer
        .write_all(b"ProjectFlow portable package. Import it only through ProjectFlow.\r\n")
        .map_err(|error| format!("Falha ao gravar instruções: {error}"))?;
    writer
        .finish()
        .map_err(|error| format!("Falha ao finalizar pacote: {error}"))?;
    if destination.exists() {
        fs::remove_file(destination).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("Falha ao substituir o pacote confirmado pelo usuário: {error}")
        })?;
    }
    fs::rename(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Falha ao publicar pacote: {error}")
    })?;
    Ok(())
}

async fn validate_package(
    path: &Path,
    staging_parent: &Path,
) -> PortabilityResult<ValidatedPackage> {
    let metadata = fs::metadata(path).map_err(|error| format!("Pacote inacessível: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_PACKAGE_BYTES {
        return Err("O pacote é inválido ou excede 512 MiB.".into());
    }
    let staging = StagingDirectory::create(staging_parent)?;
    let database_path = staging.path().join(DATA_ENTRY);
    let file = File::open(path).map_err(|error| format!("Falha ao abrir pacote: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("ZIP inválido: {error}"))?;
    let mut seen = HashSet::new();
    let mut manifest_bytes = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Entrada ZIP inválida: {error}"))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "O pacote contém caminho inseguro.".to_owned())?;
        let name = enclosed.to_string_lossy().replace('\\', "/");
        if !matches!(name.as_str(), MANIFEST_ENTRY | DATA_ENTRY | README_ENTRY)
            || !seen.insert(name.clone())
            || entry.is_dir()
            || entry.compression() != CompressionMethod::Stored
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(format!("Entrada não permitida no pacote: {name}"));
        }
        let limit = match name.as_str() {
            MANIFEST_ENTRY => MAX_MANIFEST_BYTES,
            DATA_ENTRY => MAX_DATA_BYTES,
            README_ENTRY => MAX_README_BYTES,
            _ => unreachable!(),
        };
        if entry.size() > limit {
            return Err(format!("A entrada {name} excede o limite permitido."));
        }
        match name.as_str() {
            MANIFEST_ENTRY => read_limited(&mut entry, &mut manifest_bytes, limit)?,
            DATA_ENTRY => {
                let mut output = File::create(&database_path)
                    .map_err(|error| format!("Falha ao criar staging: {error}"))?;
                copy_limited(&mut entry, &mut output, limit)?;
            }
            README_ENTRY => {
                let mut sink = Vec::new();
                read_limited(&mut entry, &mut sink, limit)?;
            }
            _ => unreachable!(),
        }
    }
    if seen.len() != 3
        || !seen.contains(MANIFEST_ENTRY)
        || !seen.contains(DATA_ENTRY)
        || !seen.contains(README_ENTRY)
    {
        return Err(
            "O pacote não contém exatamente manifest.json, data.sqlite e README.txt.".into(),
        );
    }
    let manifest: PackageManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("Manifest inválido: {error}"))?;
    validate_manifest(&manifest, &database_path)?;
    let workspace = load_validated_database(&database_path).await?;
    validate_workspace_graphs(&workspace)?;
    if manifest.projects != project_catalog(&workspace)
        || manifest.templates != template_catalog(&workspace)
    {
        return Err("O catálogo do pacote não corresponde ao banco contido nele.".into());
    }
    if manifest.export_type == ExportType::Project
        && (workspace.projects.len() != 1 || !workspace.templates.is_empty())
    {
        return Err(
            "Um pacote de projeto deve conter exatamente um projeto e nenhum template.".into(),
        );
    }
    Ok(ValidatedPackage {
        manifest,
        _staging: staging,
        workspace,
    })
}

fn validate_manifest(manifest: &PackageManifest, database_path: &Path) -> PortabilityResult<()> {
    if manifest.format != FORMAT_NAME
        || manifest.format_version != FORMAT_VERSION
        || manifest.schema_version != DATABASE_SCHEMA_VERSION
    {
        return Err(
            "Formato ou versão do pacote incompatível com esta versão do ProjectFlow.".into(),
        );
    }
    chrono::DateTime::parse_from_rfc3339(&manifest.exported_at)
        .map_err(|_| "A data de exportação do manifest é inválida.".to_owned())?;
    let actual_size = fs::metadata(database_path)
        .map_err(|error| format!("Falha ao validar banco: {error}"))?
        .len();
    if actual_size != manifest.data_size || sha256_file(database_path)? != manifest.data_sha256 {
        return Err("A integridade SHA-256 do banco exportado não confere.".into());
    }
    Ok(())
}

async fn load_validated_database(path: &Path) -> PortabilityResult<WorkspaceData> {
    let mut connection = open_connection(path, true).await?;
    let integrity: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| format!("Falha no quick_check: {error}"))?;
    if integrity != "ok" {
        return Err(format!("Banco corrompido: {integrity}"));
    }
    let foreign_keys: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
        .fetch_all(&mut connection)
        .await
        .map_err(|error| format!("Falha ao validar chaves estrangeiras: {error}"))?;
    if !foreign_keys.is_empty() {
        return Err("O banco contém referências inválidas.".into());
    }
    let version: String =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = 'schema_version'")
            .fetch_one(&mut connection)
            .await
            .map_err(|error| format!("Banco sem schema reconhecido: {error}"))?;
    if version != DATABASE_SCHEMA_VERSION.to_string() {
        return Err(format!(
            "Schema {version} não é compatível com schema {DATABASE_SCHEMA_VERSION}."
        ));
    }
    connection
        .close()
        .await
        .map_err(|error| error.to_string())?;
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite:{}",
        path.to_string_lossy().replace('\\', "/")
    ))
    .map_err(|error| error.to_string())?
    .read_only(true);
    let pool = SqlitePool::connect_with(options)
        .await
        .map_err(|error| format!("Falha ao abrir banco validado: {error}"))?;
    let workspace = persistence::load_workspace(&pool)
        .await
        .map_err(|error| format!("Falha ao ler banco validado: {error}"))?;
    pool.close().await;
    Ok(workspace)
}

async fn open_connection(path: &Path, read_only: bool) -> PortabilityResult<SqliteConnection> {
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite:{}",
        path.to_string_lossy().replace('\\', "/")
    ))
    .map_err(|error| format!("Caminho SQLite inválido: {error}"))?
    .read_only(read_only);
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("Falha ao abrir SQLite: {error}"))
}

fn sha256_file(path: &Path) -> PortabilityResult<String> {
    let mut file = File::open(path).map_err(|error| format!("Falha ao calcular hash: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Falha ao calcular hash: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn read_limited(reader: &mut impl Read, output: &mut Vec<u8>, limit: u64) -> PortabilityResult<()> {
    copy_limited(reader, output, limit).map(|_| ())
}

fn copy_limited(
    reader: &mut impl Read,
    writer: &mut impl Write,
    limit: u64,
) -> PortabilityResult<u64> {
    let mut limited = reader.take(limit + 1);
    let copied = std::io::copy(&mut limited, writer)
        .map_err(|error| format!("Falha ao extrair pacote: {error}"))?;
    if copied > limit {
        return Err("Uma entrada excedeu o limite permitido durante a extração.".into());
    }
    Ok(copied)
}

fn validate_workspace_graphs(workspace: &WorkspaceData) -> PortabilityResult<()> {
    let project_ids: HashSet<_> = workspace
        .projects
        .iter()
        .map(|project| project.id.as_str())
        .collect();
    for project in &workspace.projects {
        let tasks: Vec<_> = workspace
            .tasks
            .iter()
            .filter(|task| task.project_id == project.id)
            .cloned()
            .collect();
        parent_first_tasks(&tasks)?;
        validate_dependency_graph(
            tasks.iter().map(|task| task.id.as_str()),
            workspace
                .dependencies
                .iter()
                .filter(|dependency| dependency.project_id == project.id)
                .map(|dependency| {
                    (
                        dependency.predecessor_id.as_str(),
                        dependency.successor_id.as_str(),
                    )
                }),
        )?;
    }
    if workspace
        .tasks
        .iter()
        .any(|task| !project_ids.contains(task.project_id.as_str()))
    {
        return Err("O pacote contém tarefa fora de um projeto válido.".into());
    }
    for template in &workspace.templates {
        let items: Vec<_> = workspace
            .template_items
            .iter()
            .filter(|item| item.template_id == template.id)
            .map(|item| item.id.as_str())
            .collect();
        validate_template_hierarchy(
            workspace
                .template_items
                .iter()
                .filter(|item| item.template_id == template.id)
                .map(|item| (item.id.as_str(), item.parent_id.as_deref())),
        )?;
        validate_dependency_graph(
            items,
            workspace
                .template_dependencies
                .iter()
                .filter(|dependency| dependency.template_id == template.id)
                .map(|dependency| {
                    (
                        dependency.predecessor_id.as_str(),
                        dependency.successor_id.as_str(),
                    )
                }),
        )?;
    }
    Ok(())
}

fn validate_template_hierarchy<'a>(
    items: impl IntoIterator<Item = (&'a str, Option<&'a str>)>,
) -> PortabilityResult<()> {
    let items: Vec<_> = items.into_iter().collect();
    let ids: HashSet<_> = items.iter().map(|(id, _)| *id).collect();
    for (id, _) in &items {
        let mut visited = HashSet::from([*id]);
        let mut current = items
            .iter()
            .find(|(candidate, _)| candidate == id)
            .and_then(|(_, parent)| *parent);
        while let Some(parent) = current {
            if !ids.contains(parent) {
                return Err("A hierarquia do template contém pai ausente.".into());
            }
            if !visited.insert(parent) {
                return Err("A hierarquia do template contém ciclo.".into());
            }
            current = items
                .iter()
                .find(|(candidate, _)| *candidate == parent)
                .and_then(|(_, next)| *next);
        }
    }
    Ok(())
}

fn validate_dependency_graph<'a>(
    nodes: impl IntoIterator<Item = &'a str>,
    edges: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> PortabilityResult<()> {
    let nodes: HashSet<&str> = nodes.into_iter().collect();
    let mut indegree: HashMap<&str, usize> = nodes.iter().map(|node| (*node, 0)).collect();
    let mut successors: HashMap<&str, Vec<&str>> = HashMap::new();
    for (predecessor, successor) in edges {
        if predecessor == successor || !nodes.contains(predecessor) || !nodes.contains(successor) {
            return Err("O pacote contém dependência inválida.".into());
        }
        *indegree.entry(successor).or_default() += 1;
        successors.entry(predecessor).or_default().push(successor);
    }
    let mut queue: VecDeque<_> = indegree
        .iter()
        .filter_map(|(node, degree)| (*degree == 0).then_some(*node))
        .collect();
    let mut visited = 0;
    while let Some(node) = queue.pop_front() {
        visited += 1;
        for successor in successors.get(node).into_iter().flatten() {
            let degree = indegree.get_mut(successor).expect("successor exists");
            *degree -= 1;
            if *degree == 0 {
                queue.push_back(successor);
            }
        }
    }
    if visited != nodes.len() {
        return Err("O pacote contém ciclo de dependências.".into());
    }
    Ok(())
}

fn parent_first_tasks(tasks: &[TaskRecord]) -> PortabilityResult<Vec<&TaskRecord>> {
    let ids: HashSet<_> = tasks.iter().map(|task| task.id.as_str()).collect();
    let mut inserted = HashSet::<&str>::new();
    let mut remaining: Vec<_> = tasks.iter().collect();
    let mut ordered = Vec::with_capacity(tasks.len());
    while !remaining.is_empty() {
        let previous = remaining.len();
        let mut pending = Vec::new();
        for task in remaining {
            if let Some(parent_id) = task.parent_id.as_deref() {
                if !ids.contains(parent_id) {
                    return Err("A hierarquia contém pai ausente.".into());
                }
                if !inserted.contains(parent_id) {
                    pending.push(task);
                    continue;
                }
            }
            inserted.insert(task.id.as_str());
            ordered.push(task);
        }
        if pending.len() == previous {
            return Err("A hierarquia contém ciclo.".into());
        }
        remaining = pending;
    }
    Ok(ordered)
}

fn reject_duplicate_selections(selection: &ImportSelection) -> PortabilityResult<()> {
    let project_ids: HashSet<_> = selection
        .projects
        .iter()
        .map(|project| project.project_id.as_str())
        .collect();
    let template_ids: HashSet<_> = selection.template_ids.iter().map(String::as_str).collect();
    if project_ids.len() != selection.projects.len()
        || template_ids.len() != selection.template_ids.len()
    {
        return Err("A seleção contém itens duplicados.".into());
    }
    Ok(())
}

fn validate_selection(
    workspace: &WorkspaceData,
    selection: &ImportSelection,
) -> PortabilityResult<()> {
    if selection.projects.iter().any(|selected| {
        !workspace
            .projects
            .iter()
            .any(|project| project.id == selected.project_id)
    }) || selection.template_ids.iter().any(|selected| {
        !workspace
            .templates
            .iter()
            .any(|template| template.id == *selected)
    }) {
        return Err("A seleção não corresponde ao conteúdo validado do pacote.".into());
    }
    Ok(())
}

fn remap_project(
    project: &ProjectRecord,
    tasks: &[TaskRecord],
    dependencies: &[DependencyRecord],
    position: i64,
    now: &str,
) -> (ProjectRecord, Vec<TaskRecord>, Vec<DependencyRecord>) {
    let project_id = Uuid::new_v4().to_string();
    let task_ids: HashMap<_, _> = tasks
        .iter()
        .map(|task| (task.id.clone(), Uuid::new_v4().to_string()))
        .collect();
    let mut project_copy = project.clone();
    project_copy.id = project_id.clone();
    project_copy.name = format!("{} — importado", project.name);
    project_copy.position = position;
    project_copy.created_at = now.into();
    project_copy.updated_at = now.into();
    let task_copies = tasks
        .iter()
        .map(|task| {
            let mut copy = task.clone();
            copy.id = task_ids[&task.id].clone();
            copy.project_id = project_id.clone();
            copy.parent_id = task
                .parent_id
                .as_ref()
                .map(|parent| task_ids[parent].clone());
            copy.created_at = now.into();
            copy.updated_at = now.into();
            copy
        })
        .collect();
    let dependency_copies = dependencies
        .iter()
        .map(|dependency| {
            let mut copy = dependency.clone();
            copy.id = Uuid::new_v4().to_string();
            copy.project_id = project_id.clone();
            copy.predecessor_id = task_ids[&dependency.predecessor_id].clone();
            copy.successor_id = task_ids[&dependency.successor_id].clone();
            copy.created_at = now.into();
            copy.updated_at = now.into();
            copy
        })
        .collect();
    (project_copy, task_copies, dependency_copies)
}

async fn import_required_calendars(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    local: &WorkspaceData,
    source: &WorkspaceData,
    project: &ProjectRecord,
    tasks: &[TaskRecord],
    now: &str,
    mapping: &mut HashMap<String, String>,
) -> PortabilityResult<()> {
    let mut required = HashSet::from([project.calendar_id.clone()]);
    required.extend(tasks.iter().filter_map(|task| task.calendar_id.clone()));
    for calendar_id in required {
        if mapping.contains_key(&calendar_id) {
            continue;
        }
        let incoming = source
            .calendars
            .iter()
            .find(|calendar| calendar.id == calendar_id)
            .ok_or_else(|| format!("Calendário {calendar_id} ausente no pacote."))?;
        match local
            .calendars
            .iter()
            .find(|calendar| calendar.id == calendar_id)
        {
            None => {
                persistence::save_calendar_record(transaction, incoming)
                    .await
                    .map_err(|error| format!("Falha ao importar calendário: {error}"))?;
                mapping.insert(calendar_id.clone(), calendar_id);
            }
            Some(existing) if calendars_equivalent(existing, incoming) => {
                mapping.insert(calendar_id.clone(), calendar_id);
            }
            Some(_) => {
                let new_id = Uuid::new_v4().to_string();
                let mut copy = incoming.clone();
                copy.id = new_id.clone();
                copy.name = format!("{} — importado", copy.name);
                copy.is_default = false;
                copy.created_at = now.into();
                copy.updated_at = now.into();
                for exception in &mut copy.exceptions {
                    exception.id = Uuid::new_v4().to_string();
                    exception.calendar_id = new_id.clone();
                    exception.created_at = now.into();
                    exception.updated_at = now.into();
                }
                persistence::save_calendar_record(transaction, &copy)
                    .await
                    .map_err(|error| format!("Falha ao copiar calendário: {error}"))?;
                mapping.insert(calendar_id, new_id);
            }
        }
    }
    Ok(())
}

fn calendars_equivalent(left: &CalendarRecord, right: &CalendarRecord) -> bool {
    left.name == right.name
        && left.working_days == right.working_days
        && left.exceptions.len() == right.exceptions.len()
        && left.exceptions.iter().all(|exception| {
            right.exceptions.iter().any(|candidate| {
                exception.date == candidate.date
                    && exception.is_working_day == candidate.is_working_day
                    && exception.name == candidate.name
            })
        })
}

fn remap_calendars(
    project: &mut ProjectRecord,
    tasks: &mut [TaskRecord],
    mapping: &HashMap<String, String>,
) {
    if let Some(mapped) = mapping.get(&project.calendar_id) {
        project.calendar_id = mapped.clone();
    }
    for task in tasks {
        if let Some(mapped) = task.calendar_id.as_ref().and_then(|id| mapping.get(id)) {
            task.calendar_id = Some(mapped.clone());
        }
    }
}

async fn ensure_no_foreign_id_collisions(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    project: &ProjectRecord,
    tasks: &[TaskRecord],
    dependencies: &[DependencyRecord],
) -> PortabilityResult<()> {
    for task in tasks {
        let collision: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE id = ? AND project_id <> ?")
                .bind(&task.id)
                .bind(&project.id)
                .fetch_one(&mut **transaction)
                .await
                .map_err(|error| format!("Falha ao validar identidades: {error}"))?;
        if collision != 0 {
            return Err(format!(
                "O UUID da tarefa {} já pertence a outro projeto.",
                task.id
            ));
        }
    }
    for dependency in dependencies {
        let collision: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM task_dependencies WHERE id = ? AND project_id <> ?",
        )
        .bind(&dependency.id)
        .bind(&project.id)
        .fetch_one(&mut **transaction)
        .await
        .map_err(|error| format!("Falha ao validar identidades: {error}"))?;
        if collision != 0 {
            return Err(format!(
                "O UUID da dependência {} já pertence a outro projeto.",
                dependency.id
            ));
        }
    }
    Ok(())
}

fn template_bundle(
    workspace: &WorkspaceData,
    template_id: &str,
) -> PortabilityResult<TaskTemplateBundleRecord> {
    let template = workspace
        .templates
        .iter()
        .find(|template| template.id == template_id)
        .cloned()
        .ok_or_else(|| format!("Template {template_id} ausente."))?;
    Ok(TaskTemplateBundleRecord {
        template,
        items: workspace
            .template_items
            .iter()
            .filter(|item| item.template_id == template_id)
            .cloned()
            .collect(),
        dependencies: workspace
            .template_dependencies
            .iter()
            .filter(|dependency| dependency.template_id == template_id)
            .cloned()
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
    use uuid::Uuid;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    use super::{
        export_workspace, import_package, inspect_package, restore_backup, ImportSelection,
        ProjectImportMode, ProjectImportSelection,
    };
    use crate::{
        database::{CORE_SCHEMA, INITIAL_SCHEMA, REUSE_SCHEMA, SCHEDULING_SCHEMA},
        persistence::{
            self, DependencyRecord, DuplicationBundleRecord, ProjectRecord, TaskRecord,
            TaskTemplateBundleRecord, TaskTemplateDependencyRecord, TaskTemplateItemRecord,
            TaskTemplateRecord,
        },
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("projectflow-test-{}", Uuid::new_v4()));
            std::fs::create_dir(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    async fn database(path: &Path) -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePool::connect_with(options)
            .await
            .expect("test database should open");
        for migration in [INITIAL_SCHEMA, CORE_SCHEMA, SCHEDULING_SCHEMA, REUSE_SCHEMA] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("migration should apply");
        }
        pool
    }

    fn project(id: &str, name: &str, updated_at: &str) -> ProjectRecord {
        ProjectRecord {
            id: id.into(),
            name: name.into(),
            description: Some(format!("Descrição de {name}")),
            status: "ACTIVE".into(),
            calendar_id: "00000000-0000-4000-8000-000000000001".into(),
            position: 0,
            is_archived: false,
            created_at: "2026-08-01T10:00:00Z".into(),
            updated_at: updated_at.into(),
        }
    }

    fn task(id: &str, project_id: &str, parent_id: Option<&str>, title: &str) -> TaskRecord {
        TaskRecord {
            id: id.into(),
            code: None,
            project_id: project_id.into(),
            parent_id: parent_id.map(Into::into),
            calendar_id: None,
            title: title.into(),
            description: None,
            status: "NOT_STARTED".into(),
            priority: "NORMAL".into(),
            progress: 0,
            start_date: Some("2026-08-31".into()),
            end_date: Some("2026-08-31".into()),
            duration_days: Some(1),
            scheduling_mode: "AUTO".into(),
            position: 0,
            assignee: None,
            notes: None,
            created_at: "2026-08-01T10:00:00Z".into(),
            updated_at: "2026-08-01T10:00:00Z".into(),
            tags: vec!["teste".into()],
        }
    }

    async fn seed_project(pool: &SqlitePool, project_id: &str, name: &str, updated_at: &str) {
        let first_id = format!("{project_id}-task-a");
        let second_id = format!("{project_id}-task-b");
        persistence::save_duplication_bundle(
            pool,
            &DuplicationBundleRecord {
                project: Some(project(project_id, name, updated_at)),
                tasks: vec![
                    task(&first_id, project_id, None, "Preparar"),
                    task(&second_id, project_id, None, "Executar"),
                ],
                dependencies: vec![DependencyRecord {
                    id: format!("{project_id}-dependency"),
                    project_id: project_id.into(),
                    predecessor_id: first_id,
                    successor_id: second_id,
                    dependency_type: "FS".into(),
                    lag_days: 1,
                    created_at: "2026-08-01T10:00:00Z".into(),
                    updated_at: "2026-08-01T10:00:00Z".into(),
                }],
            },
        )
        .await
        .expect("project should be seeded");
    }

    async fn seed_template(pool: &SqlitePool, template_id: &str) {
        let first = format!("{template_id}-item-a");
        let second = format!("{template_id}-item-b");
        persistence::save_template_bundle(
            pool,
            &TaskTemplateBundleRecord {
                template: TaskTemplateRecord {
                    id: template_id.into(),
                    name: "Template de auditoria".into(),
                    description: None,
                    created_at: "2026-08-01T10:00:00Z".into(),
                    updated_at: "2026-08-01T10:00:00Z".into(),
                },
                items: vec![
                    TaskTemplateItemRecord {
                        id: first.clone(),
                        template_id: template_id.into(),
                        parent_id: None,
                        title: "Primeiro".into(),
                        description: None,
                        duration_days: Some(1),
                        priority: "NORMAL".into(),
                        initial_status: "NOT_STARTED".into(),
                        position: 0,
                        created_at: "2026-08-01T10:00:00Z".into(),
                        updated_at: "2026-08-01T10:00:00Z".into(),
                        tags: vec!["modelo".into()],
                    },
                    TaskTemplateItemRecord {
                        id: second.clone(),
                        template_id: template_id.into(),
                        parent_id: None,
                        title: "Segundo".into(),
                        description: None,
                        duration_days: Some(2),
                        priority: "HIGH".into(),
                        initial_status: "NOT_STARTED".into(),
                        position: 0,
                        created_at: "2026-08-01T10:00:00Z".into(),
                        updated_at: "2026-08-01T10:00:00Z".into(),
                        tags: vec![],
                    },
                ],
                dependencies: vec![TaskTemplateDependencyRecord {
                    id: format!("{template_id}-dependency"),
                    template_id: template_id.into(),
                    predecessor_id: first,
                    successor_id: second,
                    dependency_type: "FS".into(),
                    lag_days: 0,
                    created_at: "2026-08-01T10:00:00Z".into(),
                    updated_at: "2026-08-01T10:00:00Z".into(),
                }],
            },
        )
        .await
        .expect("template should be seeded");
    }

    #[tokio::test]
    async fn workspace_round_trip_is_semantically_equal() {
        let directory = TestDirectory::new();
        let source = database(&directory.path().join("source.sqlite")).await;
        seed_project(&source, "project-a", "Projeto A", "2026-08-20T10:00:00Z").await;
        seed_template(&source, "template-a").await;
        let expected = persistence::load_workspace(&source)
            .await
            .expect("source should load");
        let package = directory.path().join("workspace.projectflow");
        export_workspace(&source, &package, &directory.path().join("staging"))
            .await
            .expect("workspace should export");

        let destination = database(&directory.path().join("destination.sqlite")).await;
        let preview = inspect_package(&destination, &package, &directory.path().join("inspect"))
            .await
            .expect("package should validate");
        import_package(
            &destination,
            &package,
            &directory.path().join("import"),
            &directory.path().join("backups"),
            &ImportSelection {
                projects: preview
                    .projects
                    .iter()
                    .map(|project| ProjectImportSelection {
                        project_id: project.id.clone(),
                        mode: ProjectImportMode::Replace,
                    })
                    .collect(),
                template_ids: preview
                    .templates
                    .iter()
                    .map(|template| template.id.clone())
                    .collect(),
            },
        )
        .await
        .expect("workspace should import");
        let actual = persistence::load_workspace(&destination)
            .await
            .expect("destination should load");
        assert_eq!(
            serde_json::to_value((
                &actual.projects,
                &actual.tasks,
                &actual.dependencies,
                &actual.templates,
                &actual.template_items,
                &actual.template_dependencies,
            ))
            .expect("actual should serialize"),
            serde_json::to_value((
                &expected.projects,
                &expected.tasks,
                &expected.dependencies,
                &expected.templates,
                &expected.template_items,
                &expected.template_dependencies,
            ))
            .expect("expected should serialize")
        );
        assert_eq!(actual.calendars.len(), expected.calendars.len());
        for expected_calendar in &expected.calendars {
            let actual_calendar = actual
                .calendars
                .iter()
                .find(|calendar| calendar.id == expected_calendar.id)
                .expect("calendar identity should survive");
            assert!(super::calendars_equivalent(
                actual_calendar,
                expected_calendar
            ));
        }
    }

    #[tokio::test]
    async fn selective_replace_preserves_unselected_local_project() {
        let directory = TestDirectory::new();
        let source = database(&directory.path().join("source.sqlite")).await;
        seed_project(
            &source,
            "project-a",
            "Projeto atualizado",
            "2026-08-20T10:00:00Z",
        )
        .await;
        seed_project(
            &source,
            "project-b",
            "Projeto B do pacote",
            "2026-08-20T10:00:00Z",
        )
        .await;
        let package = directory.path().join("workspace.projectflow");
        export_workspace(&source, &package, &directory.path().join("staging"))
            .await
            .expect("workspace should export");

        let destination = database(&directory.path().join("destination.sqlite")).await;
        seed_project(
            &destination,
            "project-a",
            "Projeto antigo",
            "2026-08-01T10:00:00Z",
        )
        .await;
        seed_project(
            &destination,
            "project-local",
            "Somente local",
            "2026-08-01T10:00:00Z",
        )
        .await;
        import_package(
            &destination,
            &package,
            &directory.path().join("import"),
            &directory.path().join("backups"),
            &ImportSelection {
                projects: vec![ProjectImportSelection {
                    project_id: "project-a".into(),
                    mode: ProjectImportMode::Replace,
                }],
                template_ids: vec![],
            },
        )
        .await
        .expect("selected project should replace");
        let actual = persistence::load_workspace(&destination)
            .await
            .expect("workspace should load");
        assert_eq!(actual.projects.len(), 2);
        assert!(actual
            .projects
            .iter()
            .any(|project| project.id == "project-local"));
        assert_eq!(
            actual
                .projects
                .iter()
                .find(|project| project.id == "project-a")
                .map(|project| project.name.as_str()),
            Some("Projeto atualizado")
        );
        assert!(!actual
            .projects
            .iter()
            .any(|project| project.id == "project-b"));
    }

    #[tokio::test]
    async fn importing_as_copy_remaps_internal_identifiers() {
        let directory = TestDirectory::new();
        let source = database(&directory.path().join("source.sqlite")).await;
        seed_project(&source, "project-a", "Projeto A", "2026-08-20T10:00:00Z").await;
        let package = directory.path().join("workspace.projectflow");
        export_workspace(&source, &package, &directory.path().join("staging"))
            .await
            .expect("workspace should export");
        let destination = database(&directory.path().join("destination.sqlite")).await;
        seed_project(
            &destination,
            "project-a",
            "Projeto local",
            "2026-08-01T10:00:00Z",
        )
        .await;
        import_package(
            &destination,
            &package,
            &directory.path().join("import"),
            &directory.path().join("backups"),
            &ImportSelection {
                projects: vec![ProjectImportSelection {
                    project_id: "project-a".into(),
                    mode: ProjectImportMode::Copy,
                }],
                template_ids: vec![],
            },
        )
        .await
        .expect("copy should import");
        let actual = persistence::load_workspace(&destination)
            .await
            .expect("workspace should load");
        let copy = actual
            .projects
            .iter()
            .find(|project| project.id != "project-a")
            .expect("copy should exist");
        let copy_tasks: Vec<_> = actual
            .tasks
            .iter()
            .filter(|task| task.project_id == copy.id)
            .collect();
        let copy_dependency = actual
            .dependencies
            .iter()
            .find(|dependency| dependency.project_id == copy.id)
            .expect("dependency should be copied");
        assert_eq!(copy_tasks.len(), 2);
        assert!(copy_tasks
            .iter()
            .any(|task| task.id == copy_dependency.predecessor_id));
        assert!(copy_tasks
            .iter()
            .any(|task| task.id == copy_dependency.successor_id));
        assert!(copy.name.ends_with("— importado"));
    }

    #[tokio::test]
    async fn unexpected_zip_entry_is_rejected_before_writing() {
        let directory = TestDirectory::new();
        let source = database(&directory.path().join("source.sqlite")).await;
        seed_project(&source, "project-a", "Projeto A", "2026-08-20T10:00:00Z").await;
        let package = directory.path().join("workspace.projectflow");
        export_workspace(&source, &package, &directory.path().join("staging"))
            .await
            .expect("workspace should export");
        {
            let file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&package)
                .expect("package should open");
            let mut writer = ZipWriter::new_append(file).expect("zip should append");
            writer
                .start_file(
                    "../unsafe.txt",
                    SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
                )
                .expect("entry should start");
            std::io::Write::write_all(&mut writer, b"unsafe").expect("entry should write");
            writer.finish().expect("zip should finish");
        }
        let destination = database(&directory.path().join("destination.sqlite")).await;
        let result =
            inspect_package(&destination, &package, &directory.path().join("inspect")).await;
        assert!(result.is_err());
        assert!(persistence::load_workspace(&destination)
            .await
            .expect("destination should load")
            .projects
            .is_empty());
    }

    #[tokio::test]
    async fn import_rolls_back_every_selection_when_a_late_template_fails() {
        let directory = TestDirectory::new();
        let source = database(&directory.path().join("source.sqlite")).await;
        seed_project(&source, "project-a", "Projeto A", "2026-08-20T10:00:00Z").await;
        seed_template(&source, "template-a").await;
        let package = directory.path().join("workspace.projectflow");
        export_workspace(&source, &package, &directory.path().join("staging"))
            .await
            .expect("workspace should export");

        let destination = database(&directory.path().join("destination.sqlite")).await;
        persistence::save_template_bundle(
            &destination,
            &TaskTemplateBundleRecord {
                template: TaskTemplateRecord {
                    id: "template-local".into(),
                    name: "Template local".into(),
                    description: None,
                    created_at: "2026-08-01T10:00:00Z".into(),
                    updated_at: "2026-08-01T10:00:00Z".into(),
                },
                items: vec![TaskTemplateItemRecord {
                    id: "template-a-item-a".into(),
                    template_id: "template-local".into(),
                    parent_id: None,
                    title: "Colisão intencional".into(),
                    description: None,
                    duration_days: Some(1),
                    priority: "NORMAL".into(),
                    initial_status: "NOT_STARTED".into(),
                    position: 0,
                    created_at: "2026-08-01T10:00:00Z".into(),
                    updated_at: "2026-08-01T10:00:00Z".into(),
                    tags: vec![],
                }],
                dependencies: vec![],
            },
        )
        .await
        .expect("local collision fixture should exist");
        let backups = directory.path().join("backups");
        let result = import_package(
            &destination,
            &package,
            &directory.path().join("import"),
            &backups,
            &ImportSelection {
                projects: vec![ProjectImportSelection {
                    project_id: "project-a".into(),
                    mode: ProjectImportMode::Replace,
                }],
                template_ids: vec!["template-a".into()],
            },
        )
        .await;
        assert!(result.is_err());
        let actual = persistence::load_workspace(&destination)
            .await
            .expect("destination should load");
        assert!(
            actual.projects.is_empty(),
            "the earlier project insert must roll back"
        );
        assert_eq!(actual.templates.len(), 1);
        assert!(std::fs::read_dir(&backups)
            .expect("backup directory should exist")
            .next()
            .is_some());
    }

    #[tokio::test]
    async fn verified_backup_restores_complete_workspace() {
        let directory = TestDirectory::new();
        let pool = database(&directory.path().join("workspace.sqlite")).await;
        seed_project(&pool, "project-a", "Antes", "2026-08-01T10:00:00Z").await;
        let backup = super::create_backup(&pool, &directory.path().join("backups"), "manual")
            .await
            .expect("backup should succeed");
        persistence::delete_project(&pool, "project-a")
            .await
            .expect("project should delete");
        seed_project(&pool, "project-b", "Depois", "2026-08-20T10:00:00Z").await;
        let result = restore_backup(
            &pool,
            Path::new(&backup.path),
            &directory.path().join("backups"),
        )
        .await
        .expect("restore should succeed");
        let actual = persistence::load_workspace(&pool)
            .await
            .expect("workspace should load");
        assert_eq!(result.project_count, 1);
        assert!(actual
            .projects
            .iter()
            .any(|project| project.id == "project-a"));
        assert!(!actual
            .projects
            .iter()
            .any(|project| project.id == "project-b"));
        assert!(Path::new(&result.safety_backup_path).exists());
    }
}
