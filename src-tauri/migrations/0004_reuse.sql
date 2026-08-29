CREATE TABLE task_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
) STRICT, WITHOUT ROWID;

CREATE INDEX task_templates_by_name
ON task_templates (name COLLATE NOCASE, created_at);

CREATE TABLE task_template_items (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    duration_days INTEGER CHECK (duration_days IS NULL OR duration_days >= 1),
    priority TEXT NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
    initial_status TEXT NOT NULL CHECK (
        initial_status IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')
    ),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    UNIQUE (template_id, id),
    CHECK (parent_id IS NULL OR parent_id <> id),
    FOREIGN KEY (template_id) REFERENCES task_templates (id) ON DELETE CASCADE,
    FOREIGN KEY (template_id, parent_id)
        REFERENCES task_template_items (template_id, id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX task_template_items_hierarchy
ON task_template_items (template_id, parent_id, position, created_at);

CREATE TABLE task_template_tags (
    template_item_id TEXT NOT NULL,
    tag_name TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (template_item_id, tag_name),
    FOREIGN KEY (template_item_id) REFERENCES task_template_items (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_name) REFERENCES tags (name) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX task_template_tags_by_tag
ON task_template_tags (tag_name, template_item_id);

CREATE TABLE task_template_dependencies (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL,
    predecessor_id TEXT NOT NULL,
    successor_id TEXT NOT NULL,
    dependency_type TEXT NOT NULL CHECK (dependency_type = 'FS'),
    lag_days INTEGER NOT NULL DEFAULT 0 CHECK (lag_days >= 0),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    CHECK (predecessor_id <> successor_id),
    UNIQUE (template_id, predecessor_id, successor_id, dependency_type),
    FOREIGN KEY (template_id, predecessor_id)
        REFERENCES task_template_items (template_id, id) ON DELETE CASCADE,
    FOREIGN KEY (template_id, successor_id)
        REFERENCES task_template_items (template_id, id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX task_template_dependencies_by_predecessor
ON task_template_dependencies (template_id, predecessor_id);

CREATE INDEX task_template_dependencies_by_successor
ON task_template_dependencies (template_id, successor_id);

CREATE TRIGGER task_template_dependencies_require_leaf_items
BEFORE INSERT ON task_template_dependencies
WHEN EXISTS (
    SELECT 1 FROM task_template_items
    WHERE parent_id = NEW.predecessor_id OR parent_id = NEW.successor_id
)
BEGIN
    SELECT RAISE(ABORT, 'summary template items cannot have dependencies');
END;

CREATE TRIGGER task_template_dependencies_require_leaf_items_on_update
BEFORE UPDATE OF predecessor_id, successor_id ON task_template_dependencies
WHEN EXISTS (
    SELECT 1 FROM task_template_items
    WHERE parent_id = NEW.predecessor_id OR parent_id = NEW.successor_id
)
BEGIN
    SELECT RAISE(ABORT, 'summary template items cannot have dependencies');
END;

CREATE TRIGGER task_template_parent_must_not_have_dependencies_on_insert
BEFORE INSERT ON task_template_items
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM task_template_dependencies
    WHERE predecessor_id = NEW.parent_id OR successor_id = NEW.parent_id
)
BEGIN
    SELECT RAISE(ABORT, 'a template item with dependencies cannot become a summary');
END;

CREATE TRIGGER task_template_parent_must_not_have_dependencies_on_update
BEFORE UPDATE OF parent_id ON task_template_items
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM task_template_dependencies
    WHERE predecessor_id = NEW.parent_id OR successor_id = NEW.parent_id
)
BEGIN
    SELECT RAISE(ABORT, 'a template item with dependencies cannot become a summary');
END;

UPDATE app_metadata SET value = '4' WHERE key = 'schema_version';
