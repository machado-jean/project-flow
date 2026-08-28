ALTER TABLE tasks
ADD COLUMN calendar_id TEXT REFERENCES calendars (id) ON DELETE RESTRICT;

CREATE INDEX tasks_calendar ON tasks (calendar_id);

CREATE TABLE calendar_exceptions (
    id TEXT PRIMARY KEY NOT NULL,
    calendar_id TEXT NOT NULL,
    exception_date TEXT NOT NULL CHECK (length(exception_date) = 10),
    is_working_day INTEGER NOT NULL CHECK (is_working_day IN (0, 1)),
    name TEXT,
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    UNIQUE (calendar_id, exception_date),
    FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX calendar_exceptions_by_date
ON calendar_exceptions (calendar_id, exception_date);

CREATE TABLE task_dependencies (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    predecessor_id TEXT NOT NULL,
    successor_id TEXT NOT NULL,
    dependency_type TEXT NOT NULL CHECK (dependency_type = 'FS'),
    lag_days INTEGER NOT NULL DEFAULT 0 CHECK (lag_days >= 0),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    CHECK (predecessor_id <> successor_id),
    UNIQUE (predecessor_id, successor_id, dependency_type),
    FOREIGN KEY (project_id, predecessor_id)
        REFERENCES tasks (project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, successor_id)
        REFERENCES tasks (project_id, id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX task_dependencies_by_predecessor
ON task_dependencies (project_id, predecessor_id);

CREATE INDEX task_dependencies_by_successor
ON task_dependencies (project_id, successor_id);

CREATE TRIGGER task_dependencies_require_leaf_tasks
BEFORE INSERT ON task_dependencies
WHEN EXISTS (
    SELECT 1 FROM tasks
    WHERE parent_id = NEW.predecessor_id OR parent_id = NEW.successor_id
)
BEGIN
    SELECT RAISE(ABORT, 'summary tasks cannot have dependencies');
END;

CREATE TRIGGER task_dependencies_require_leaf_tasks_on_update
BEFORE UPDATE OF predecessor_id, successor_id ON task_dependencies
WHEN EXISTS (
    SELECT 1 FROM tasks
    WHERE parent_id = NEW.predecessor_id OR parent_id = NEW.successor_id
)
BEGIN
    SELECT RAISE(ABORT, 'summary tasks cannot have dependencies');
END;

CREATE TRIGGER tasks_parent_must_not_have_dependencies_on_insert
BEFORE INSERT ON tasks
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM task_dependencies
    WHERE predecessor_id = NEW.parent_id OR successor_id = NEW.parent_id
)
BEGIN
    SELECT RAISE(ABORT, 'a task with dependencies cannot become a summary task');
END;

CREATE TRIGGER tasks_parent_must_not_have_dependencies_on_update
BEFORE UPDATE OF parent_id ON tasks
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM task_dependencies
    WHERE predecessor_id = NEW.parent_id OR successor_id = NEW.parent_id
)
BEGIN
    SELECT RAISE(ABORT, 'a task with dependencies cannot become a summary task');
END;

INSERT INTO calendars (id, name, is_default, created_at, updated_at)
VALUES (
    '00000000-0000-4000-8000-000000000002',
    'Todos os dias',
    0,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO calendar_working_days (calendar_id, weekday)
VALUES
    ('00000000-0000-4000-8000-000000000002', 1),
    ('00000000-0000-4000-8000-000000000002', 2),
    ('00000000-0000-4000-8000-000000000002', 3),
    ('00000000-0000-4000-8000-000000000002', 4),
    ('00000000-0000-4000-8000-000000000002', 5),
    ('00000000-0000-4000-8000-000000000002', 6),
    ('00000000-0000-4000-8000-000000000002', 7);

UPDATE app_metadata SET value = '3' WHERE key = 'schema_version';
