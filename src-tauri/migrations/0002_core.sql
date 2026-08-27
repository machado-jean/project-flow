CREATE TABLE calendars (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX calendars_single_default
ON calendars (is_default)
WHERE is_default = 1;

CREATE TABLE calendar_working_days (
    calendar_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    PRIMARY KEY (calendar_id, weekday),
    FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    status TEXT NOT NULL CHECK (length(trim(status)) > 0),
    calendar_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE INDEX projects_ordering ON projects (is_archived, position, created_at);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT,
    project_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    status TEXT NOT NULL CHECK (length(trim(status)) > 0),
    priority TEXT NOT NULL CHECK (length(trim(priority)) > 0),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    start_date TEXT,
    end_date TEXT,
    duration_days INTEGER,
    scheduling_mode TEXT NOT NULL CHECK (length(trim(scheduling_mode)) > 0),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    assignee TEXT,
    notes TEXT,
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
    UNIQUE (project_id, id),
    CHECK (parent_id IS NULL OR parent_id <> id),
    CHECK (
        (start_date IS NULL AND end_date IS NULL AND duration_days IS NULL)
        OR
        (
            start_date IS NOT NULL
            AND end_date IS NOT NULL
            AND duration_days IS NOT NULL
            AND duration_days >= 1
            AND length(start_date) = 10
            AND length(end_date) = 10
            AND end_date >= start_date
        )
    ),
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, parent_id) REFERENCES tasks (project_id, id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX tasks_project_hierarchy_ordering
ON tasks (project_id, parent_id, position, created_at);

CREATE INDEX tasks_project_status ON tasks (project_id, status);
CREATE INDEX tasks_project_priority ON tasks (project_id, priority);
CREATE INDEX tasks_project_dates ON tasks (project_id, start_date, end_date);

CREATE TABLE tags (
    name TEXT PRIMARY KEY NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0)
) STRICT, WITHOUT ROWID;

CREATE TABLE task_tags (
    task_id TEXT NOT NULL,
    tag_name TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (task_id, tag_name),
    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_name) REFERENCES tags (name) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX task_tags_by_tag ON task_tags (tag_name, task_id);

INSERT INTO calendars (id, name, is_default, created_at, updated_at)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Calendário padrão',
    1,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO calendar_working_days (calendar_id, weekday)
VALUES
    ('00000000-0000-4000-8000-000000000001', 1),
    ('00000000-0000-4000-8000-000000000001', 2),
    ('00000000-0000-4000-8000-000000000001', 3),
    ('00000000-0000-4000-8000-000000000001', 4),
    ('00000000-0000-4000-8000-000000000001', 5);

UPDATE app_metadata SET value = '2' WHERE key = 'schema_version';

