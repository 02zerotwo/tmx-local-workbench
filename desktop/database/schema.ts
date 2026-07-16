import type Database from "better-sqlite3";

export const DATABASE_VERSION = 5;

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

const MIGRATION_V4 = `
  CREATE TABLE ai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    rules_json TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(rules_json) AND json_type(rules_json) = 'object'),
    key_verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE ai_agent_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'archived')),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    summary TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_ai_agent_sessions_project_updated
    ON ai_agent_sessions(project_id, pinned DESC, updated_at DESC);

  CREATE TABLE ai_agent_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
    parent_message_id TEXT REFERENCES ai_agent_messages(id) ON DELETE SET NULL,
    branch_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    parts_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(parts_json) AND json_type(parts_json) = 'array'),
    status TEXT NOT NULL DEFAULT 'complete'
      CHECK (status IN ('streaming', 'complete', 'interrupted', 'error')),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_ai_agent_messages_session_branch_created
    ON ai_agent_messages(session_id, branch_id, created_at, id);

  CREATE TABLE ai_agent_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
    user_message_id TEXT NOT NULL REFERENCES ai_agent_messages(id) ON DELETE CASCADE,
    assistant_message_id TEXT REFERENCES ai_agent_messages(id) ON DELETE SET NULL,
    start_checkpoint_id TEXT,
    status TEXT NOT NULL
      CHECK (status IN ('running', 'complete', 'stopped', 'interrupted', 'error')),
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    error TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
    started_at TEXT NOT NULL,
    finished_at TEXT
  );

  CREATE INDEX idx_ai_agent_runs_session_started
    ON ai_agent_runs(session_id, started_at DESC);

  CREATE TABLE ai_agent_tool_calls (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    tool_call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments_json TEXT NOT NULL DEFAULT '{}'
      CHECK (json_valid(arguments_json) AND json_type(arguments_json) = 'object'),
    result_json TEXT,
    status TEXT NOT NULL
      CHECK (status IN ('pending', 'running', 'waiting_confirmation', 'complete', 'error')),
    requires_confirmation INTEGER NOT NULL DEFAULT 0
      CHECK (requires_confirmation IN (0, 1)),
    confirmed_at TEXT,
    error TEXT,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(run_id, tool_call_id),
    UNIQUE(idempotency_key)
  );

  CREATE TABLE ai_agent_checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL,
    message_id TEXT REFERENCES ai_agent_messages(id) ON DELETE SET NULL,
    context_summary TEXT NOT NULL DEFAULT '',
    pending_action_json TEXT
      CHECK (pending_action_json IS NULL OR json_valid(pending_action_json)),
    status TEXT NOT NULL DEFAULT 'ready'
      CHECK (status IN ('ready', 'restored', 'superseded')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX idx_ai_agent_checkpoints_session_created
    ON ai_agent_checkpoints(session_id, branch_id, created_at DESC);

  CREATE TABLE ai_audit_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES ai_agent_sessions(id) ON DELETE SET NULL,
    filters_json TEXT NOT NULL
      CHECK (json_valid(filters_json) AND json_type(filters_json) = 'object'),
    boundaries_json TEXT NOT NULL
      CHECK (json_valid(boundaries_json) AND json_type(boundaries_json) = 'object'),
    model TEXT NOT NULL,
    status TEXT NOT NULL
      CHECK (status IN ('draft', 'queued', 'running', 'paused', 'stopped', 'complete', 'partial_failure', 'applied')),
    total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
    completed_items INTEGER NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
    finding_items INTEGER NOT NULL DEFAULT 0 CHECK (finding_items >= 0),
    failed_items INTEGER NOT NULL DEFAULT 0 CHECK (failed_items >= 0),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_ai_audit_jobs_project_updated
    ON ai_audit_jobs(project_id, updated_at DESC);

  CREATE TABLE ai_audit_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES ai_audit_jobs(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    queue_ordinal INTEGER NOT NULL CHECK (queue_ordinal > 0),
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'running', 'complete', 'failed', 'skipped', 'stale')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error TEXT,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(job_id, row_id),
    UNIQUE(job_id, queue_ordinal),
    FOREIGN KEY (project_id, row_id)
      REFERENCES translation_units(project_id, row_id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_ai_audit_items_job_status_ordinal
    ON ai_audit_items(job_id, status, queue_ordinal);

  CREATE TABLE ai_audit_findings (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES ai_audit_jobs(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES ai_audit_items(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    summary TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    suggested_target_text TEXT,
    edited_target_text TEXT,
    confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
    decision TEXT NOT NULL DEFAULT 'pending'
      CHECK (decision IN ('pending', 'accepted', 'rejected', 'edited', 'skipped', 'stale')),
    content_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id, row_id)
      REFERENCES translation_units(project_id, row_id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_ai_audit_findings_job_decision_severity
    ON ai_audit_findings(job_id, decision, severity);

  CREATE TABLE ai_audit_apply_sets (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES ai_audit_jobs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'applying', 'applied', 'failed')),
    selected_count INTEGER NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
    error TEXT,
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    applied_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE ai_audit_apply_items (
    apply_set_id TEXT NOT NULL REFERENCES ai_audit_apply_sets(id) ON DELETE CASCADE,
    finding_id TEXT NOT NULL REFERENCES ai_audit_findings(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    proposed_target_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 1 CHECK (selected IN (0, 1)),
    PRIMARY KEY (apply_set_id, finding_id),
    FOREIGN KEY (project_id, row_id)
      REFERENCES translation_units(project_id, row_id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_ai_audit_apply_items_set_selected
    ON ai_audit_apply_items(apply_set_id, selected);
`;

const MIGRATION_V5 = `
  CREATE TABLE ai_agent_revisions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES ai_agent_messages(id) ON DELETE SET NULL,
    tool_call_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    source_text TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    original_target_text TEXT NOT NULL,
    suggested_target_text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'accuracy',
    reason TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'applied', 'ignored', 'stale')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    applied_at TEXT,
    UNIQUE(session_id, tool_call_id),
    FOREIGN KEY (project_id, row_id)
      REFERENCES translation_units(project_id, row_id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_ai_agent_revisions_session_status
    ON ai_agent_revisions(session_id, status, created_at);
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

    if (currentVersion < 4) {
      db.exec(MIGRATION_V4);
      db.pragma("user_version = 4");
    }

    if (currentVersion < 5) {
      db.exec(MIGRATION_V5);
      db.pragma("user_version = 5");
    }
  });

  migrate.immediate();
}
