// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ProjectFilters,
  ProjectPageSize,
  ProjectQuery,
} from "../../src/lib/desktop-types";
import { ProjectRepository } from "./project-repository";
import { DATABASE_VERSION, runMigrations } from "./schema";
import {
  type InsertTranslationUnit,
  UnitRepository,
} from "./unit-repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "./test-database";

const FIRST_TIMESTAMP = new Date("2026-07-13T02:00:00.000Z");
const SECOND_TIMESTAMP = new Date("2026-07-13T03:00:00.000Z");
const THIRD_TIMESTAMP = new Date("2026-07-13T04:00:00.000Z");

const EMPTY_FILTERS: ProjectFilters = {
  query: "",
  targetLanguage: "",
  status: "all",
  duplicateOnly: false,
};

const LEGACY_VERSION_2_SCHEMA = `
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

type RepositoryHarness = {
  db: Database.Database;
  projectRepository: ProjectRepository;
  repository: UnitRepository;
  projectId: string;
  setNow: (value: Date) => void;
};

type CompleteTextUpdate = {
  sourceText: string;
  targetText: string;
};

let testDatabase: TestDatabase | undefined;
let harness: RepositoryHarness;

function createHarness(): RepositoryHarness {
  testDatabase = createTestDatabase();
  let now = FIRST_TIMESTAMP;
  let nextUnitId = 1;
  const projectRepository = new ProjectRepository(testDatabase.db, {
    now: () => now,
    createId: () => "project-main",
  });
  const projectId = projectRepository.createProject({
    name: "Service Manual",
    sourceFileName: "manual.tmx",
    sourceLanguage: "zh-CN",
    targetLanguages: ["en-US", "de-DE"],
    fileSize: 4_096,
    importStatus: "ready",
  }).id;
  const repository = new UnitRepository(testDatabase.db, {
    now: () => now,
    createId: () => `generated-row-${nextUnitId++}`,
  });

  return {
    db: testDatabase.db,
    projectRepository,
    repository,
    projectId,
    setNow: (value) => {
      now = value;
    },
  };
}

function unit(
  rowId: string,
  position: number,
  overrides: Partial<InsertTranslationUnit> = {},
): InsertTranslationUnit {
  return {
    rowId,
    id: `external-${rowId}`,
    position,
    sourceLang: "zh-CN",
    sourceText: `源文 ${rowId}`,
    targetLang: "en-US",
    targetText: `Target ${rowId}`,
    originalTargetText: `Target ${rowId}`,
    metadata: { section: "general" },
    duplicateKey: null,
    ...overrides,
  };
}

function query(
  repository: UnitRepository,
  projectId: string,
  filters: Partial<ProjectFilters> = {},
  page = 1,
  pageSize: ProjectPageSize = 100,
) {
  const request: ProjectQuery = {
    projectId,
    filters: { ...EMPTY_FILTERS, ...filters },
    page,
    pageSize,
  };

  return repository.queryProject(request);
}

function updateCompleteTranslation(
  repository: UnitRepository,
  projectId: string,
  rowId: string,
  update: CompleteTextUpdate,
) {
  const updateTranslation = repository.updateTranslation as unknown as (
    projectId: string,
    rowId: string,
    update: CompleteTextUpdate,
  ) => ReturnType<UnitRepository["updateTranslation"]>;

  return updateTranslation.call(repository, projectId, rowId, update);
}

function createVersion2Database(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LEGACY_VERSION_2_SCHEMA);
  db.pragma("user_version = 2");

  return db;
}

function seedFilterRows(current: RepositoryHarness): void {
  current.repository.insertUnits(current.projectId, [
    unit("row-original-en", 1, {
      sourceText: "设备启动说明",
      targetText: "Start the machine safely",
      originalTargetText: "Start the machine safely",
      metadata: { section: "installation guide" },
    }),
    unit("row-changed-en", 2, {
      sourceText: "报警复位步骤",
      targetText: "Reset the alarm now",
      originalTargetText: "Reset alarm",
      duplicateKey: "duplicate-alarm",
      metadata: { note: "factory calibration warning" },
    }),
    unit("row-empty-en", 3, {
      sourceText: "需要维护",
      targetText: "",
      originalTargetText: "",
      metadata: { section: "maintenance" },
    }),
    unit("row-changed-empty-en", 4, {
      sourceText: "报警复位步骤",
      targetText: "",
      originalTargetText: "Alarm reset procedure",
      duplicateKey: "duplicate-alarm",
      metadata: { note: "changed to empty" },
    }),
    unit("row-original-de", 5, {
      sourceText: "设备校准说明",
      targetLang: "de-DE",
      targetText: "Maschine kalibrieren",
      originalTargetText: "Maschine kalibrieren",
      metadata: { section: "Kalibrierung" },
    }),
    unit("row-literal-like", 6, {
      sourceText: "完成度 100%_ready",
      targetText: "Literal wildcard markers",
      originalTargetText: "Literal wildcard markers",
    }),
  ]);
}

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  testDatabase?.cleanup();
  testDatabase = undefined;
});

describe("UnitRepository insertion and mapping", () => {
  it("inserts a batch transactionally, derives independent flags, and maps renderer rows", () => {
    seedFilterRows(harness);

    const result = query(harness.repository, harness.projectId);
    const changedEmpty = result.rows.find(
      ({ rowId }) => rowId === "row-changed-empty-en",
    );
    const project = harness.projectRepository.getProject(harness.projectId);

    expect(result.total).toBe(6);
    expect(changedEmpty).toEqual({
      rowId: "row-changed-empty-en",
      projectId: harness.projectId,
      id: "external-row-changed-empty-en",
      position: 4,
      sourceLang: "zh-CN",
      sourceText: "报警复位步骤",
      originalSourceText: "报警复位步骤",
      targetLang: "en-US",
      targetText: "",
      originalTargetText: "Alarm reset procedure",
      changed: true,
      duplicate: true,
      metadata: { note: "changed to empty" },
      updatedAt: FIRST_TIMESTAMP.toISOString(),
    });
    expect(project).toMatchObject({
      totalUnits: 6,
      changedUnits: 2,
      emptyUnits: 2,
    });

    const stored = harness.db.prepare(`
      SELECT row_id, changed, is_empty, status
      FROM translation_units
      ORDER BY ordinal, row_id
    `).all();
    expect(stored).toEqual(expect.arrayContaining([
      {
        row_id: "row-changed-empty-en",
        changed: 1,
        is_empty: 1,
        status: "empty",
      },
      {
        row_id: "row-changed-en",
        changed: 1,
        is_empty: 0,
        status: "changed",
      },
      {
        row_id: "row-empty-en",
        changed: 0,
        is_empty: 1,
        status: "empty",
      },
    ]));
  });

  it("rolls back the entire batch and project counters when an insert fails", () => {
    const duplicateRows = [
      unit("same-row", 1),
      unit("same-row", 2),
    ];

    expect(() => (
      harness.repository.insertUnits(harness.projectId, duplicateRows)
    )).toThrow();
    expect(query(harness.repository, harness.projectId).total).toBe(0);
    expect(harness.projectRepository.getProject(harness.projectId)).toMatchObject({
      totalUnits: 0,
      changedUnits: 0,
      emptyUnits: 0,
    });
    expect(harness.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_search",
    ).get()).toEqual({ count: 0 });
  });

  it.each([
    ["an array", []],
    ["a record with a non-string value", { section: 12 }],
    ["a class instance", new (class Metadata { section = "manual"; })()],
  ])("rejects runtime metadata that is %s", (_label, metadata) => {
    expect(() => harness.repository.insertUnits(harness.projectId, [
      unit("invalid-metadata", 1, {
        metadata: metadata as unknown as Record<string, string>,
      }),
    ])).toThrow(/metadata/i);
    expect(query(harness.repository, harness.projectId).total).toBe(0);
  });
});

describe("UnitRepository filtering and exact search", () => {
  beforeEach(() => {
    seedFilterRows(harness);
  });

  it("filters independently by language, empty, changed, and duplicates", () => {
    expect(query(
      harness.repository,
      harness.projectId,
      { targetLanguage: "de-DE" },
    ).rows.map(({ rowId }) => rowId)).toEqual(["row-original-de"]);

    expect(query(
      harness.repository,
      harness.projectId,
      { status: "empty" },
    ).rows.map(({ rowId }) => rowId)).toEqual([
      "row-empty-en",
      "row-changed-empty-en",
    ]);

    expect(query(
      harness.repository,
      harness.projectId,
      { status: "changed" },
    ).rows.map(({ rowId }) => rowId)).toEqual([
      "row-changed-en",
      "row-changed-empty-en",
    ]);

    expect(query(
      harness.repository,
      harness.projectId,
      { duplicateOnly: true },
    ).rows.map(({ rowId }) => rowId)).toEqual([
      "row-changed-en",
      "row-changed-empty-en",
    ]);
  });

  it("combines every active filter with AND semantics", () => {
    const result = query(harness.repository, harness.projectId, {
      query: "报警复位",
      targetLanguage: "en-US",
      status: "empty",
      duplicateOnly: true,
    });

    expect(result.rows.map(({ rowId }) => rowId)).toEqual([
      "row-changed-empty-en",
    ]);
    expect(query(harness.repository, harness.projectId, {
      query: "报警复位",
      targetLanguage: "de-DE",
      status: "empty",
      duplicateOnly: true,
    }).total).toBe(0);
  });

  it("matches Chinese and English substrings across source and target with fuzzy LIKE", () => {
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "报警复位" },
    ).rows.map(({ rowId }) => rowId)).toEqual([
      "row-changed-en",
      "row-changed-empty-en",
    ]);
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "the alarm" },
    ).rows.map(({ rowId }) => rowId)).toEqual(["row-changed-en"]);
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "alarmx" },
    ).total).toBe(0);
  });

  it("does not match document-level metadata such as notes or x-document", () => {
    // "factory calibration warning" only lives in row-changed-en's metadata note,
    // never in its source/target — so a metadata-only term must return nothing.
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "calibration" },
    ).total).toBe(0);
  });

  it("searches only source and target text, not the external ID", () => {
    // "external-row-original-en" is row-original-en's external ID, which the
    // search box no longer looks at — only 原文/译文 are matched.
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "external-row-original-en" },
    ).total).toBe(0);
    // A term that lives in the source text still matches.
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "设备启动" },
    ).rows.map(({ rowId }) => rowId)).toEqual(["row-original-en"]);
  });

  it("uses escaped LIKE for queries under three characters", () => {
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "维护" },
    ).rows.map(({ rowId }) => rowId)).toEqual(["row-empty-en"]);
    expect(query(
      harness.repository,
      harness.projectId,
      { query: "%_" },
    ).rows.map(({ rowId }) => rowId)).toEqual(["row-literal-like"]);
  });

  it("treats special-character and SQL-injection-shaped input as literal text", () => {
    expect(() => query(harness.repository, harness.projectId, {
      query: "alarm\" OR calibration",
    })).not.toThrow();
    expect(query(harness.repository, harness.projectId, {
      query: "alarm\" OR calibration",
    }).total).toBe(0);
    expect(query(harness.repository, harness.projectId, {
      query: "' OR 1=1 --",
    }).total).toBe(0);
    expect(query(harness.repository, harness.projectId, {
      query: "%_",
      targetLanguage: "de-DE",
    }).total).toBe(0);
  });

  it("uses plain LIKE without any FTS join for long-query count and page SQL", () => {
    const statements: string[] = [];
    const db = new Database(":memory:", {
      verbose: (statement) => statements.push(String(statement).trim()),
    });

    try {
      db.pragma("foreign_keys = ON");
      runMigrations(db);
      const projectRepository = new ProjectRepository(db, {
        createId: () => "search-plan-project",
        now: () => FIRST_TIMESTAMP,
      });
      const projectId = projectRepository.createProject({
        name: "Search plan",
        sourceFileName: "search-plan.tmx",
        sourceLanguage: "zh-CN",
        targetLanguages: ["en-US"],
        fileSize: 100,
        importStatus: "ready",
      }).id;
      const repository = new UnitRepository(db, {
        now: () => FIRST_TIMESTAMP,
      });
      repository.insertUnits(projectId, [
        unit("search-plan-row", 1, {
          targetText: "Searchable calibration text",
          originalTargetText: "Searchable calibration text",
        }),
      ]);
      statements.length = 0;

      expect(query(repository, projectId, {
        query: "calibration",
        targetLanguage: "en-US",
      }).rows.map(({ rowId }) => rowId)).toEqual(["search-plan-row"]);

      // better-sqlite3's verbose logger inlines bound parameters, so the LIKE
      // search shows up as `LIKE '%...%' ESCAPE '\'` rather than `LIKE ?`.
      const searchStatements = statements.filter((statement) => (
        /FROM translation_units u/i.test(statement)
        && /LIKE '[^']*' ESCAPE/i.test(statement)
      ));
      expect(searchStatements).toHaveLength(2);
      for (const statement of searchStatements) {
        expect(statement).not.toMatch(/translation_search/i);
        expect(statement).not.toMatch(/\bMATCH\b/i);
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all() as Array<{
          detail: string;
        }>;
        expect(plan.some(({ detail }) => /VIRTUAL TABLE/i.test(detail))).toBe(false);
      }
    } finally {
      db.close();
    }
  });
});

describe("UnitRepository pagination", () => {
  it("counts first, orders by ordinal and row ID, and clamps pages", () => {
    const rows = Array.from({ length: 205 }, (_, index) => {
      const number = 205 - index;
      return unit(`page-${String(number).padStart(3, "0")}`, Math.ceil(number / 2));
    });
    harness.repository.insertUnits(harness.projectId, rows);
    const expectedOrder = [...rows].sort((left, right) => (
      left.position - right.position
      || String(left.rowId).localeCompare(String(right.rowId))
    ));

    const pageTwo = query(harness.repository, harness.projectId, {}, 2, 100);
    expect(pageTwo).toMatchObject({
      total: 205,
      page: 2,
      pageSize: 100,
      pageCount: 3,
    });
    expect(pageTwo.rows.map(({ rowId }) => rowId)).toEqual(
      expectedOrder.slice(100, 200).map(({ rowId }) => rowId),
    );

    const afterLastPage = query(harness.repository, harness.projectId, {}, 99, 100);
    expect(afterLastPage.page).toBe(3);
    expect(afterLastPage.rows).toHaveLength(5);

    const beforeFirstPage = query(harness.repository, harness.projectId, {}, -5, 100);
    expect(beforeFirstPage.page).toBe(1);
    expect(beforeFirstPage.rows).toHaveLength(100);
  });

  it("accepts only the supported page sizes and keeps an empty result on page one", () => {
    for (const pageSize of [100, 200, 500] as const) {
      expect(query(harness.repository, harness.projectId, {}, 1, pageSize)).toMatchObject({
        total: 0,
        page: 1,
        pageSize,
        pageCount: 1,
      });
    }

    expect(() => query(
      harness.repository,
      harness.projectId,
      {},
      1,
      50 as ProjectPageSize,
    )).toThrow(/page size/i);
  });
});

describe("UnitRepository single-row editing", () => {
  it("atomically updates source and target with complete before/after history snapshots", () => {
    harness.repository.insertUnits(harness.projectId, [
      unit("complete-edit", 1, {
        sourceText: "Original source marker",
        targetText: "Original target marker",
        originalTargetText: "Original target marker",
      }),
    ]);
    harness.setNow(SECOND_TIMESTAMP);

    const edited = updateCompleteTranslation(
      harness.repository,
      harness.projectId,
      "complete-edit",
      {
        sourceText: "Revised source marker",
        targetText: "Revised target marker",
      },
    );

    expect(edited).toMatchObject({
      sourceText: "Revised source marker",
      originalSourceText: "Original source marker",
      targetText: "Revised target marker",
      originalTargetText: "Original target marker",
      changed: true,
      updatedAt: SECOND_TIMESTAMP.toISOString(),
    });
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "complete-edit",
    )).toEqual([
      {
        projectId: harness.projectId,
        rowId: "complete-edit",
        version: 1,
        previousSourceText: "Original source marker",
        sourceText: "Revised source marker",
        previousTargetText: "Original target marker",
        targetText: "Revised target marker",
        changedAt: SECOND_TIMESTAMP.toISOString(),
      },
    ]);
    expect(query(harness.repository, harness.projectId, {
      query: "Revised source",
    }).rows.map(({ rowId }) => rowId)).toEqual(["complete-edit"]);
    expect(query(harness.repository, harness.projectId, {
      query: "Original source",
    }).total).toBe(0);
  });

  it("counts a source-only edit as changed while target emptiness controls empty status", () => {
    harness.repository.insertUnits(harness.projectId, [
      unit("source-only", 1, {
        sourceText: "Imported source",
        targetText: "",
        originalTargetText: "",
      }),
    ]);
    harness.setNow(SECOND_TIMESTAMP);

    const edited = updateCompleteTranslation(
      harness.repository,
      harness.projectId,
      "source-only",
      { sourceText: "Edited source", targetText: "" },
    );

    expect(edited).toMatchObject({ changed: true, targetText: "" });
    expect(query(harness.repository, harness.projectId, {
      status: "changed",
    }).rows.map(({ rowId }) => rowId)).toEqual(["source-only"]);
    expect(query(harness.repository, harness.projectId, {
      status: "empty",
    }).rows.map(({ rowId }) => rowId)).toEqual(["source-only"]);
    expect(harness.projectRepository.getProject(harness.projectId)).toMatchObject({
      changedUnits: 1,
      emptyUnits: 1,
      updatedAt: SECOND_TIMESTAMP.toISOString(),
    });
  });

  it("does not create history when both source and target are unchanged", () => {
    harness.repository.insertUnits(harness.projectId, [unit("complete-no-op", 1)]);
    harness.setNow(SECOND_TIMESTAMP);

    const unchanged = updateCompleteTranslation(
      harness.repository,
      harness.projectId,
      "complete-no-op",
      {
        sourceText: "源文 complete-no-op",
        targetText: "Target complete-no-op",
      },
    );

    expect(unchanged.updatedAt).toBe(FIRST_TIMESTAMP.toISOString());
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "complete-no-op",
    )).toEqual([]);
  });

  it("stores real edits as newest-first per-row history with UTC timestamps", () => {
    harness.repository.insertUnits(harness.projectId, [
      unit("editable", 1, {
        targetText: "Original target",
        originalTargetText: "Original target",
      }),
      unit("second-row", 2),
    ]);

    harness.setNow(SECOND_TIMESTAMP);
    const firstEdit = harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      { sourceText: "源文 editable", targetText: "First revision" },
    );
    harness.repository.updateTranslation(
      harness.projectId,
      "second-row",
      { sourceText: "源文 second-row", targetText: "Second row revision" },
    );
    harness.setNow(THIRD_TIMESTAMP);
    const secondEdit = harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      { sourceText: "源文 editable", targetText: "Final revision" },
    );

    expect(firstEdit.updatedAt).toBe(SECOND_TIMESTAMP.toISOString());
    expect(secondEdit.updatedAt).toBe(THIRD_TIMESTAMP.toISOString());
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "editable",
    )).toEqual([
      {
        projectId: harness.projectId,
        rowId: "editable",
        version: 2,
        previousSourceText: "源文 editable",
        sourceText: "源文 editable",
        previousTargetText: "First revision",
        targetText: "Final revision",
        changedAt: THIRD_TIMESTAMP.toISOString(),
      },
      {
        projectId: harness.projectId,
        rowId: "editable",
        version: 1,
        previousSourceText: "源文 editable",
        sourceText: "源文 editable",
        previousTargetText: "Original target",
        targetText: "First revision",
        changedAt: SECOND_TIMESTAMP.toISOString(),
      },
    ]);
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "second-row",
    )).toEqual([
      expect.objectContaining({
        rowId: "second-row",
        version: 1,
        changedAt: SECOND_TIMESTAMP.toISOString(),
      }),
    ]);
  });

  it("does not create history or change updatedAt for a no-op edit", () => {
    harness.repository.insertUnits(harness.projectId, [unit("editable", 1)]);
    harness.setNow(SECOND_TIMESTAMP);

    const unchanged = harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      { sourceText: "源文 editable", targetText: "Target editable" },
    );

    expect(unchanged.updatedAt).toBe(FIRST_TIMESTAMP.toISOString());
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "editable",
    )).toEqual([]);
  });

  it("updates one row, FTS, independent flags, counters, and UTC timestamps", () => {
    harness.repository.insertUnits(harness.projectId, [
      unit("editable", 1, {
        sourceText: "可编辑文本",
        targetText: "Original target",
        originalTargetText: "Original target",
        metadata: { note: "keep me" },
      }),
      unit("untouched", 2),
    ]);
    harness.setNow(SECOND_TIMESTAMP);

    const edited = harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      {
        sourceText: "可编辑文本",
        targetText: "Revised searchable translation",
      },
    );

    expect(edited).toMatchObject({
      rowId: "editable",
      targetText: "Revised searchable translation",
      changed: true,
      metadata: { note: "keep me" },
    });
    expect(query(harness.repository, harness.projectId, {
      query: "searchable",
    }).rows.map(({ rowId }) => rowId)).toEqual(["editable"]);
    expect(query(harness.repository, harness.projectId, {
      query: "Original target",
    }).total).toBe(0);
    expect(harness.projectRepository.getProject(harness.projectId)).toMatchObject({
      totalUnits: 2,
      changedUnits: 1,
      emptyUnits: 0,
      updatedAt: SECOND_TIMESTAMP.toISOString(),
    });
    expect(harness.db.prepare(
      "SELECT updated_at FROM translation_units WHERE row_id = ?",
    ).get("editable")).toEqual({ updated_at: SECOND_TIMESTAMP.toISOString() });

    harness.setNow(THIRD_TIMESTAMP);
    const emptied = harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      { sourceText: "可编辑文本", targetText: "" },
    );
    expect(emptied).toMatchObject({ changed: true, targetText: "" });
    expect(query(harness.repository, harness.projectId, {
      status: "changed",
    }).rows.map(({ rowId }) => rowId)).toEqual(["editable"]);
    expect(query(harness.repository, harness.projectId, {
      status: "empty",
    }).rows.map(({ rowId }) => rowId)).toEqual(["editable"]);
    expect(harness.projectRepository.getProject(harness.projectId)).toMatchObject({
      changedUnits: 1,
      emptyUnits: 1,
      updatedAt: THIRD_TIMESTAMP.toISOString(),
    });
    expect(harness.db.prepare(`
      SELECT changed, is_empty, status
      FROM translation_units
      WHERE row_id = ?
    `).get("editable")).toEqual({ changed: 1, is_empty: 1, status: "empty" });
    expect(harness.db.prepare(
      "SELECT target_text FROM translation_units WHERE row_id = ?",
    ).get("untouched")).toEqual({ target_text: "Target untouched" });
  });

  it("computes counter deltas when a row returns to its original text", () => {
    harness.repository.insertUnits(harness.projectId, [unit("editable", 1)]);
    harness.repository.updateTranslation(harness.projectId, "editable", {
      sourceText: "源文 editable",
      targetText: "Changed",
    });
    harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      { sourceText: "源文 editable", targetText: "Target editable" },
    );

    expect(harness.projectRepository.getProject(harness.projectId)).toMatchObject({
      changedUnits: 0,
      emptyUnits: 0,
    });
    expect(query(harness.repository, harness.projectId, {
      status: "changed",
    }).total).toBe(0);
  });

  it("rolls back the row, FTS, counters, and timestamp when project update aborts", () => {
    harness.repository.insertUnits(harness.projectId, [
      unit("editable", 1, {
        sourceText: "Original searchable source",
        targetText: "Original searchable target",
        originalTargetText: "Original searchable target",
      }),
    ]);
    const storedBefore = harness.db.prepare(`
      SELECT source_text, target_text, changed, is_empty, status, updated_at
      FROM translation_units
      WHERE row_id = ?
    `).get("editable");
    const projectBefore = harness.projectRepository.getProject(harness.projectId);
    harness.db.exec(`
      CREATE TRIGGER abort_project_counter_update
      BEFORE UPDATE ON projects
      WHEN old.id = 'project-main'
      BEGIN
        SELECT RAISE(ABORT, 'project counter update blocked');
      END
    `);
    harness.setNow(SECOND_TIMESTAMP);

    expect(() => harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      {
        sourceText: "Replacement source rollback marker",
        targetText: "Replacement target rollback marker",
      },
    )).toThrow(/project counter update blocked/i);

    const storedAfter = harness.db.prepare(`
      SELECT source_text, target_text, changed, is_empty, status, updated_at
      FROM translation_units
      WHERE row_id = ?
    `).get("editable");
    expect(storedAfter).toEqual(storedBefore);
    expect(storedAfter).toMatchObject({
      source_text: "Original searchable source",
      target_text: "Original searchable target",
    });
    expect(query(harness.repository, harness.projectId, {
      query: "Original searchable source",
    }).rows.map(({ rowId }) => rowId)).toEqual(["editable"]);
    expect(query(harness.repository, harness.projectId, {
      query: "Original searchable target",
    }).rows.map(({ rowId }) => rowId)).toEqual(["editable"]);
    expect(query(harness.repository, harness.projectId, {
      query: "Replacement source",
    }).total).toBe(0);
    expect(query(harness.repository, harness.projectId, {
      query: "Replacement target",
    }).total).toBe(0);
    expect(harness.projectRepository.getProject(harness.projectId)).toEqual(projectBefore);
    expect(harness.repository.getTranslationHistory(
      harness.projectId,
      "editable",
    )).toEqual([]);
  });

  it("updates counters by delta without COUNT or SUM project-wide scans", () => {
    const statements: string[] = [];
    const db = new Database(":memory:", {
      verbose: (statement) => statements.push(String(statement).trim()),
    });

    try {
      db.pragma("foreign_keys = ON");
      runMigrations(db);
      const projectRepository = new ProjectRepository(db, {
        createId: () => "traced-project",
        now: () => FIRST_TIMESTAMP,
      });
      const projectId = projectRepository.createProject({
        name: "Traced project",
        sourceFileName: "traced.tmx",
        sourceLanguage: "zh-CN",
        targetLanguages: ["en-US"],
        fileSize: 100,
        importStatus: "ready",
      }).id;
      const repository = new UnitRepository(db, {
        now: () => SECOND_TIMESTAMP,
      });
      repository.insertUnits(projectId, [unit("editable", 1)]);
      statements.length = 0;

      repository.updateTranslation(projectId, "editable", {
        sourceText: "源文 editable",
        targetText: "Changed target",
      });

      const editStatements = statements.map((statement) => (
        statement.replace(/\s+/g, " ").trim()
      ));
      expect(editStatements.some((statement) => (
        /UPDATE translation_units/i.test(statement)
      ))).toBe(true);
      expect(editStatements.some((statement) => (
        /UPDATE projects/i.test(statement)
      ))).toBe(true);
      expect(editStatements.some((statement) => (
        /\b(?:COUNT|SUM)\s*\(/i.test(statement)
      ))).toBe(false);
    } finally {
      db.close();
    }
  });
});

describe("translation history schema migration", () => {
  it("migrates a complete v2 database without losing data or FTS behavior", () => {
    const db = createVersion2Database();

    try {
      db.exec(`
        INSERT INTO projects (
          id, name, source_file_name, source_language, target_languages,
          total_units, changed_units, empty_units, skipped_units, import_status,
          file_size, imported_at, created_at, updated_at
        ) VALUES (
          'legacy-project', 'Legacy Manual', 'legacy.tmx', 'zh-CN', '["en-US"]',
          1, 1, 0, 0, 'ready', 2048,
          '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z',
          '2026-07-12T01:00:00.000Z'
        );
        INSERT INTO translation_units (
          row_id, project_id, ordinal, external_id, source_lang, source_text,
          target_lang, target_text, original_target_text, changed, is_empty,
          status, duplicate_key, metadata_json, updated_at
        ) VALUES (
          'legacy-row', 'legacy-project', 7, 'legacy-external', 'zh-CN',
          'Current legacy source searchable', 'en-US',
          'Current legacy target searchable', 'Imported legacy target',
          1, 0, 'changed', NULL, '{"section":"legacy metadata searchable"}',
          '2026-07-12T01:00:00.000Z'
        );
        INSERT INTO translation_unit_history (
          project_id, row_id, version, previous_target_text, target_text, changed_at
        ) VALUES (
          'legacy-project', 'legacy-row', 1, 'Imported legacy target',
          'Current legacy target searchable', '2026-07-12T01:00:00.000Z'
        );
      `);

      expect(db.prepare(`
        SELECT unit_key
        FROM translation_search
        WHERE translation_search MATCH '"legacy source searchable"'
      `).all()).toEqual([{ unit_key: "legacy-row" }]);

      runMigrations(db);

      expect(DATABASE_VERSION).toBe(5);
      expect(db.pragma("user_version", { simple: true })).toBe(5);
      const projects = new ProjectRepository(db);
      const repository = new UnitRepository(db, {
        now: () => SECOND_TIMESTAMP,
      });

      expect(projects.getProject("legacy-project")).toMatchObject({
        id: "legacy-project",
        name: "Legacy Manual",
        fileName: "legacy.tmx",
        totalUnits: 1,
        changedUnits: 1,
        fileSize: 2048,
      });
      expect(query(repository, "legacy-project").rows).toEqual([
        {
          rowId: "legacy-row",
          projectId: "legacy-project",
          id: "legacy-external",
          position: 7,
          sourceLang: "zh-CN",
          sourceText: "Current legacy source searchable",
          originalSourceText: "Current legacy source searchable",
          targetLang: "en-US",
          targetText: "Current legacy target searchable",
          originalTargetText: "Imported legacy target",
          changed: true,
          duplicate: false,
          metadata: { section: "legacy metadata searchable" },
          updatedAt: "2026-07-12T01:00:00.000Z",
        },
      ]);
      for (const searchText of [
        "legacy source searchable",
        "legacy target searchable",
      ]) {
        expect(query(repository, "legacy-project", {
          query: searchText,
        }).rows.map(({ rowId }) => rowId)).toEqual(["legacy-row"]);
      }
      // Metadata is no longer part of fuzzy search.
      expect(query(repository, "legacy-project", {
        query: "legacy metadata searchable",
      }).total).toBe(0);
      expect(repository.getTranslationHistory(
        "legacy-project",
        "legacy-row",
      )).toEqual([
        {
          projectId: "legacy-project",
          rowId: "legacy-row",
          version: 1,
          previousSourceText: "Current legacy source searchable",
          sourceText: "Current legacy source searchable",
          previousTargetText: "Imported legacy target",
          targetText: "Current legacy target searchable",
          changedAt: "2026-07-12T01:00:00.000Z",
        },
      ]);

      repository.updateTranslation("legacy-project", "legacy-row", {
        sourceText: "Migrated source trigger searchable",
        targetText: "Current legacy target searchable",
      });

      expect(query(repository, "legacy-project", {
        query: "legacy source searchable",
      }).total).toBe(0);
      expect(query(repository, "legacy-project", {
        query: "source trigger searchable",
      }).rows.map(({ rowId }) => rowId)).toEqual(["legacy-row"]);
      expect(repository.getTranslationHistory(
        "legacy-project",
        "legacy-row",
      )[0]).toMatchObject({
        version: 2,
        previousSourceText: "Current legacy source searchable",
        sourceText: "Migrated source trigger searchable",
        previousTargetText: "Current legacy target searchable",
        targetText: "Current legacy target searchable",
      });
    } finally {
      db.close();
    }
  });

  it("creates the current history schema with cascade foreign keys", () => {
    const db = new Database(":memory:");

    try {
      db.pragma("foreign_keys = ON");
      runMigrations(db);

      expect(DATABASE_VERSION).toBe(5);
      expect(db.pragma("user_version", { simple: true })).toBe(5);
      expect(db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'translation_unit_history'
      `).get()).toEqual({ name: "translation_unit_history" });
      const foreignKeys = db.pragma(
        "foreign_key_list(translation_unit_history)",
      ) as Array<{ id: number; from: string; table: string; to: string }>;
      expect(foreignKeys).toHaveLength(2);
      expect(new Set(foreignKeys.map(({ id }) => id)).size).toBe(1);
      expect(foreignKeys).toEqual(expect.arrayContaining([
        expect.objectContaining({
          table: "translation_units",
          from: "project_id",
          to: "project_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "translation_units",
          from: "row_id",
          to: "row_id",
          on_delete: "CASCADE",
        }),
      ]));
    } finally {
      db.close();
    }
  });

  it("deletes translation history when its project is deleted", () => {
    harness.repository.insertUnits(harness.projectId, [unit("editable", 1)]);
    harness.setNow(SECOND_TIMESTAMP);
    harness.repository.updateTranslation(
      harness.projectId,
      "editable",
      {
        sourceText: "源文 editable",
        targetText: "Revision before project deletion",
      },
    );

    expect(harness.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_unit_history",
    ).get()).toEqual({ count: 1 });

    harness.db.prepare("DELETE FROM projects WHERE id = ?").run(harness.projectId);

    expect(harness.db.prepare(
      "SELECT COUNT(*) AS count FROM translation_unit_history",
    ).get()).toEqual({ count: 0 });
  });

  it("rejects history that combines one project with another project's row", () => {
    const otherProjectId = new ProjectRepository(harness.db, {
      createId: () => "project-other-history",
      now: () => FIRST_TIMESTAMP,
    }).createProject({
      name: "Other history project",
      sourceFileName: "other-history.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 10,
      importStatus: "ready",
    }).id;
    harness.repository.insertUnits(otherProjectId, [unit("other-project-row", 1)]);

    expect(() => harness.db.prepare(`
      INSERT INTO translation_unit_history (
        project_id, row_id, version, previous_target_text, target_text, changed_at
      ) VALUES (?, ?, 1, 'Before', 'After', ?)
    `).run(
      harness.projectId,
      "other-project-row",
      SECOND_TIMESTAMP.toISOString(),
    )).toThrow(/foreign key/i);
  });
});

describe("UnitRepository errors", () => {
  it("rejects missing projects for insertion and queries", () => {
    expect(() => harness.repository.insertUnits("missing-project", [unit("row", 1)]))
      .toThrow(/project not found/i);
    expect(() => query(harness.repository, "missing-project"))
      .toThrow(/project not found/i);
  });

  it("rejects missing rows and rows belonging to another project", () => {
    harness.repository.insertUnits(harness.projectId, [unit("owned-row", 1)]);
    const otherProjectId = new ProjectRepository(harness.db, {
      createId: () => "project-other",
      now: () => FIRST_TIMESTAMP,
    }).createProject({
      name: "Other",
      sourceFileName: "other.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 10,
      importStatus: "ready",
    }).id;

    expect(() => harness.repository.updateTranslation(
      harness.projectId,
      "missing-row",
      { sourceText: "Missing source", targetText: "New text" },
    )).toThrow(/translation unit not found/i);
    expect(() => harness.repository.updateTranslation(
      otherProjectId,
      "owned-row",
      { sourceText: "源文 owned-row", targetText: "New text" },
    )).toThrow(/translation unit not found/i);
    expect(() => harness.repository.updateTranslation(
      "missing-project",
      "owned-row",
      { sourceText: "源文 owned-row", targetText: "New text" },
    )).toThrow(/project not found/i);
  });

  it("blocks workspace queries and edits until an import is ready", () => {
    const importingProjectId = new ProjectRepository(harness.db, {
      createId: () => "project-importing",
      now: () => FIRST_TIMESTAMP,
    }).createProject({
      name: "Importing",
      sourceFileName: "importing.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 10,
      importStatus: "importing",
    }).id;
    harness.repository.insertUnits(importingProjectId, [unit("partial-row", 1)]);

    expect(() => query(harness.repository, importingProjectId))
      .toThrow(/not ready|未完成|不可访问/i);
    expect(() => harness.repository.updateTranslation(
      importingProjectId,
      "partial-row",
      {
        sourceText: "源文 partial-row",
        targetText: "Changed while importing",
      },
    )).toThrow(/not ready|未完成|不可编辑/i);
  });
});
