import type Database from "better-sqlite3";

export const DATABASE_VERSION = 3;

const MIGRATION_V1 = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    source_file_name TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_languages TEXT NOT NULL DEFAULT '[]',
    total_units INTEGER NOT NULL DEFAULT 0 CHECK (total_units >= 0),
    changed_units INTEGER NOT NULL DEFAULT 0 CHECK (changed_units >= 0),
    empty_units INTEGER NOT NULL DEFAULT 0 CHECK (empty_units >= 0),
    skipped_units INTEGER NOT NULL DEFAULT 0 CHECK (skipped_units >= 0),
    import_status TEXT NOT NULL DEFAULT 'importing'
      CHECK (import_status IN ('importing', 'ready', 'failed')),
    file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0),
    imported_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (changed_units <= total_units),
    CHECK (empty_units <= total_units)
  );

  CREATE INDEX idx_projects_updated_at
    ON projects(updated_at DESC);

  CREATE TABLE translation_units (
    unit_pk INTEGER PRIMARY KEY,
    row_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    external_id TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    source_text TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    target_text TEXT NOT NULL,
    original_target_text TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0 CHECK (changed IN (0, 1)),
    is_empty INTEGER NOT NULL DEFAULT 0 CHECK (is_empty IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'original'
      CHECK (status IN ('original', 'changed', 'empty')),
    duplicate_key TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
    updated_at TEXT NOT NULL,
    CHECK (
      status = CASE
        WHEN is_empty = 1 THEN 'empty'
        WHEN changed = 1 THEN 'changed'
        ELSE 'original'
      END
    )
  );

  CREATE INDEX idx_translation_units_project_ordinal
    ON translation_units(project_id, ordinal, row_id);

  CREATE INDEX idx_translation_units_project_language_status
    ON translation_units(project_id, target_lang, status);

  CREATE INDEX idx_translation_units_project_duplicate_key
    ON translation_units(project_id, duplicate_key);

  CREATE INDEX idx_translation_units_project_language_changed
    ON translation_units(project_id, target_lang, changed);

  CREATE INDEX idx_translation_units_project_language_empty
    ON translation_units(project_id, target_lang, is_empty);

  CREATE VIRTUAL TABLE translation_search USING fts5(
    unit_key UNINDEXED,
    project_id UNINDEXED,
    external_id,
    source_text,
    target_text,
    metadata_text,
    tokenize = 'trigram'
  );

  CREATE TRIGGER translation_units_search_insert
  AFTER INSERT ON translation_units
  BEGIN
    INSERT INTO translation_search (
      rowid, unit_key, project_id, external_id, source_text, target_text, metadata_text
    ) VALUES (
      new.unit_pk, new.row_id, new.project_id, new.external_id, new.source_text,
      new.target_text, new.metadata_json
    );
  END;

  CREATE TRIGGER translation_units_search_update
  AFTER UPDATE OF
    row_id, project_id, external_id, source_text, target_text, metadata_json
  ON translation_units
  BEGIN
    DELETE FROM translation_search WHERE rowid = old.unit_pk;
    INSERT INTO translation_search (
      rowid, unit_key, project_id, external_id, source_text, target_text, metadata_text
    ) VALUES (
      new.unit_pk, new.row_id, new.project_id, new.external_id, new.source_text,
      new.target_text, new.metadata_json
    );
  END;

  CREATE TRIGGER translation_units_search_delete
  AFTER DELETE ON translation_units
  BEGIN
    DELETE FROM translation_search WHERE rowid = old.unit_pk;
  END;
`;

const MIGRATION_V2 = `
  CREATE UNIQUE INDEX idx_translation_units_project_row
    ON translation_units(project_id, row_id);

  CREATE TABLE translation_unit_history (
    history_pk INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    previous_target_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    UNIQUE(project_id, row_id, version),
    FOREIGN KEY (project_id, row_id)
      REFERENCES translation_units(project_id, row_id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_translation_unit_history_row_version
    ON translation_unit_history(project_id, row_id, version DESC);
`;

const MIGRATION_V3 = `
  ALTER TABLE translation_units
    ADD COLUMN original_source_text TEXT NOT NULL DEFAULT '';

  UPDATE translation_units
  SET original_source_text = source_text;

  ALTER TABLE translation_unit_history
    ADD COLUMN previous_source_text TEXT NOT NULL DEFAULT '';

  ALTER TABLE translation_unit_history
    ADD COLUMN source_text TEXT NOT NULL DEFAULT '';

  UPDATE translation_unit_history
  SET
    previous_source_text = COALESCE((
      SELECT source_text
      FROM translation_units
      WHERE translation_units.project_id = translation_unit_history.project_id
        AND translation_units.row_id = translation_unit_history.row_id
    ), ''),
    source_text = COALESCE((
      SELECT source_text
      FROM translation_units
      WHERE translation_units.project_id = translation_unit_history.project_id
        AND translation_units.row_id = translation_unit_history.row_id
    ), '');
`;

export function runMigrations(db: Database.Database): void {
  const migrate = db.transaction(() => {
    const currentVersion = db.pragma("user_version", { simple: true }) as number;

    if (currentVersion > DATABASE_VERSION) {
      throw new Error(
        `Database version ${currentVersion} is newer than supported version ${DATABASE_VERSION}`,
      );
    }

    if (currentVersion >= DATABASE_VERSION) {
      return;
    }

    if (currentVersion < 1) {
      db.exec(MIGRATION_V1);
      db.pragma("user_version = 1");
    }

    if (currentVersion < 2) {
      db.exec(MIGRATION_V2);
      db.pragma("user_version = 2");
    }

    if (currentVersion < 3) {
      db.exec(MIGRATION_V3);
      db.pragma("user_version = 3");
    }
  });

  migrate.immediate();
}
