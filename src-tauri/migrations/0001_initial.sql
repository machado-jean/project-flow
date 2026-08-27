CREATE TABLE app_metadata (
    key TEXT PRIMARY KEY NOT NULL CHECK (length(key) > 0),
    value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '1');
