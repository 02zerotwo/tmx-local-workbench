// @vitest-environment node

import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  resolveDatabasePath,
} from "./connection";
import { ProjectRepository } from "./project-repository";
import { DATABASE_VERSION, runMigrations } from "./schema";
import {
  createTemporaryTestDatabase,
  createTestDatabase,
  type TestDatabase,
} from "./test-database";

const FIRST_TIMESTAMP = new Date("2026-07-13T02:00:00.000Z");
const SECOND_TIMESTAMP = new Date("2026-07-13T03:00:00.000Z");

type RepositoryHarness = {
  repository: ProjectRepository;
  setNow: (value: Date) => void;
};

const databases: TestDatabase[] = [];

function useTestDatabase(): TestDatabase {
  const testDatabase = createTestDatabase();
  databases.push(testDatabase);
  return testDatabase;
}

function createRepository(db: Database.Database): RepositoryHarness {
  let now = FIRST_TIMESTAMP;
  let nextId = 1;
  const repository = new ProjectRepository(db, {
    now: () => now,
    createId: () => `project-${nextId++}`,
  });

  return {
    repository,
    setNow: (value) => {
      now = value;
    },
  };
}

function createProject(repository: ProjectRepository, name = "Manual"): string {
  return repository.createProject({
    name,
    sourceFileName: `${name}.tmx`,
    sourceLanguage: "zh-CN",
    targetLanguages: ["en-US", "de-DE"],
    fileSize: 1_024,
  }).id;
}

function seedTranslationUnit(db: Database.Database, projectId: string): void {
  db.prepare(`
    INSERT INTO translation_units (
      row_id, project_id, ordinal, external_id, source_lang, source_text,
      target_lang, target_text, original_target_text, status, duplicate_key,
      metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "row-1", projectId, 1, "external-123", "zh-CN", "Original source",
    "en-US", "Original target", "Original target", "original", null,
    JSON.stringify({ note: "factory safety warning" }), FIRST_TIMESTAMP.toISOString(),
  );
}

function getIndexColumns(
  db: Database.Database,
  indexName: string,
): Array<{ position: number; name: string }> {
  return (db.pragma(`index_info('${indexName}')`) as Array<{
    seqno: number;
    name: string;
  }>).map(({ seqno, name }) => ({ position: seqno, name }));
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

describe("database connection and migration", () => {
  it("prefers a writable portable data directory and otherwise uses user data", () => {
    expect(resolveDatabasePath({
      portableDataDirectory: "/portable/TMX/data",
      portableDataDirectoryWritable: true,
      userDataDirectory: "/user/data",
    })).toBe("/portable/TMX/data/tmx-workbench.db");

    expect(resolveDatabasePath({
      portableDataDirectory: "/portable/TMX/data",
      portableDataDirectoryWritable: false,
      userDataDirectory: "/user/data",
    })).toBe("/user/data/tmx-workbench.db");
  });

  it("enables foreign keys and uses a memory-safe journal for in-memory tests", () => {
    const { db } = useTestDatabase();

    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("journal_mode", { simple: true })).toBe("memory");
    expect(db.pragma("busy_timeout", { simple: true })).toBeGreaterThan(0);
  });

  it("uses WAL for file databases", () => {
    const testDatabase = createTemporaryTestDatabase();
    databases.push(testDatabase);

    expect(testDatabase.db.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("removes its temporary database directory during cleanup", () => {
    const testDatabase = createTemporaryTestDatabase();
    const directory = dirname(testDatabase.path);

    expect(existsSync(directory)).toBe(true);
    testDatabase.cleanup();
    expect(existsSync(directory)).toBe(false);
  });

  it("removes its temporary directory when opening the database fails", () => {
    let directory: string | undefined;
    let returnedDatabase: TestDatabase | undefined;
    let thrown: unknown;

    try {
      returnedDatabase = createTemporaryTestDatabase({
        openDatabase: (path) => {
          directory = dirname(path);
          throw new Error("open failed");
        },
      });
    } catch (error) {
      thrown = error;
    }

    try {
      expect(thrown).toEqual(new Error("open failed"));
      expect(directory).toBeDefined();
      expect(existsSync(directory as string)).toBe(false);
    } finally {
      returnedDatabase?.cleanup();
      if (directory && existsSync(directory)) {
        rmSync(directory, { force: true, recursive: true });
      }
    }
  });

  it("removes its temporary directory even when closing the database throws", () => {
    const testDatabase = createTemporaryTestDatabase();
    const directory = dirname(testDatabase.path);
    const close = testDatabase.db.close.bind(testDatabase.db);
    testDatabase.db.close = () => {
      close();
      throw new Error("close failed");
    };

    try {
      expect(() => testDatabase.cleanup()).toThrow(/close failed/i);
      expect(existsSync(directory)).toBe(false);
    } finally {
      if (existsSync(directory)) {
        rmSync(directory, { force: true, recursive: true });
      }
    }
  });

  it("runs migration v1 transactionally and remains idempotent", () => {
    const { db } = useTestDatabase();

    runMigrations(db);
    const before = db.prepare(
      "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all();
    runMigrations(db);
    const after = db.prepare(
      "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all();

    expect(db.pragma("user_version", { simple: true })).toBe(DATABASE_VERSION);
    expect(after).toEqual(before);
    expect(after).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "projects", type: "table" }),
      expect.objectContaining({ name: "translation_units", type: "table" }),
      expect.objectContaining({ name: "translation_search", type: "table" }),
      expect.objectContaining({ name: "idx_translation_units_project_ordinal", type: "index" }),
      expect.objectContaining({ name: "idx_translation_units_project_language_status", type: "index" }),
      expect.objectContaining({ name: "idx_translation_units_project_duplicate_key", type: "index" }),
      expect.objectContaining({ name: "idx_translation_units_project_language_changed", type: "index" }),
      expect.objectContaining({ name: "idx_translation_units_project_language_empty", type: "index" }),
    ]));
    const fts = after.find((entry) => (
      entry as { name: string }
    ).name === "translation_search") as { sql: string };
    expect(fts.sql).toContain("tokenize = 'trigram'");
  });

  it("rechecks user_version after acquiring an IMMEDIATE transaction", () => {
    const statements: string[] = [];
    const db = new Database(":memory:", {
      verbose: (statement) => statements.push(String(statement).trim()),
    });

    try {
      runMigrations(db);

      const normalized = statements.map((statement) => statement.toUpperCase());
      const beginIndex = normalized.findIndex(
        (statement) => statement === "BEGIN IMMEDIATE",
      );
      const versionReadIndexes = normalized.flatMap((statement, index) => (
        statement === "PRAGMA USER_VERSION" ? [index] : []
      ));
      const commitIndex = normalized.findIndex((statement) => statement === "COMMIT");

      expect(beginIndex).toBeGreaterThanOrEqual(0);
      expect(versionReadIndexes).toHaveLength(1);
      expect(versionReadIndexes[0]).toBeGreaterThan(beginIndex);
      expect(versionReadIndexes[0]).toBeLessThan(commitIndex);
    } finally {
      db.close();
    }
  });

  it("creates required indexes with their exact ordered columns", () => {
    const { db } = useTestDatabase();

    expect(getIndexColumns(
      db,
      "idx_translation_units_project_ordinal",
    )).toEqual([
      { position: 0, name: "project_id" },
      { position: 1, name: "ordinal" },
      { position: 2, name: "row_id" },
    ]);
    expect(getIndexColumns(
      db,
      "idx_translation_units_project_language_status",
    )).toEqual([
      { position: 0, name: "project_id" },
      { position: 1, name: "target_lang" },
      { position: 2, name: "status" },
    ]);
    expect(getIndexColumns(
      db,
      "idx_translation_units_project_duplicate_key",
    )).toEqual([
      { position: 0, name: "project_id" },
      { position: 1, name: "duplicate_key" },
    ]);
    expect(getIndexColumns(
      db,
      "idx_translation_units_project_language_changed",
    )).toEqual([
      { position: 0, name: "project_id" },
      { position: 1, name: "target_lang" },
      { position: 2, name: "changed" },
    ]);
    expect(getIndexColumns(
      db,
      "idx_translation_units_project_language_empty",
    )).toEqual([
      { position: 0, name: "project_id" },
      { position: 1, name: "target_lang" },
      { position: 2, name: "is_empty" },
    ]);

    const uniqueIndexes = (db.pragma(
      "index_list('translation_units')",
    ) as Array<{ name: string; unique: number }>).filter(({ unique }) => unique === 1);
    expect(uniqueIndexes.some(({ name }) => (
      getIndexColumns(db, name).map(({ name: columnName }) => columnName).join(",")
      === "row_id"
    ))).toBe(true);
  });

  it("declares a stable integer primary key and independent status flags in v1", () => {
    const { db } = useTestDatabase();
    const columns = db.pragma("table_info('translation_units')") as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "unit_pk", type: "INTEGER", pk: 1 }),
      expect.objectContaining({ name: "row_id", type: "TEXT", notnull: 1, pk: 0 }),
      expect.objectContaining({ name: "changed", notnull: 1, dflt_value: "0" }),
      expect.objectContaining({ name: "is_empty", notnull: 1, dflt_value: "0" }),
      expect.objectContaining({ name: "status", notnull: 1 }),
    ]));
  });

  it.each([
    ["malformed JSON", "{"],
    ["a JSON array", "[]"],
  ])("rejects metadata_json containing %s", (_label, metadataJson) => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);

    expect(() => db.prepare(`
      INSERT INTO translation_units (
        row_id, project_id, ordinal, external_id, source_lang, source_text,
        target_lang, target_text, original_target_text, status, duplicate_key,
        metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `invalid-metadata-${metadataJson}`,
      projectId,
      1,
      "invalid-metadata",
      "zh-CN",
      "源文",
      "en-US",
      "Target",
      "Target",
      "original",
      null,
      metadataJson,
      FIRST_TIMESTAMP.toISOString(),
    )).toThrow();
  });

  it("rolls back all migration changes when a later statement fails", () => {
    const db = new Database(":memory:");

    try {
      db.exec("CREATE TABLE translation_units (conflict TEXT)");

      expect(() => runMigrations(db)).toThrow(/translation_units already exists/i);

      const schemaNames = (db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as Array<{ name: string }>).map(({ name }) => name);
      expect(schemaNames).toEqual(["translation_units"]);
      expect(schemaNames).not.toContain("projects");
      expect(schemaNames).not.toContain("idx_projects_updated_at");
      expect(db.pragma("user_version", { simple: true })).toBe(0);
    } finally {
      db.close();
    }
  });

  it("opens an injected database path and applies migrations", () => {
    const testDatabase = createTemporaryTestDatabase();
    databases.push(testDatabase);
    const reopenedPath = testDatabase.path;
    testDatabase.db.close();

    const reopened = openDatabase(reopenedPath);
    testDatabase.db = reopened;

    expect(reopened.pragma("user_version", { simple: true })).toBe(DATABASE_VERSION);
  });
});

describe("translation search synchronization", () => {
  it("indexes inserted searchable fields including external ID and metadata", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);
    db.prepare(`
      INSERT INTO translation_search (
        rowid, unit_key, project_id, external_id, source_text, target_text, metadata_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      500,
      "unrelated-row",
      projectId,
      "unrelated-id",
      "unrelated source",
      "unrelated target",
      "{}",
    );

    seedTranslationUnit(db, projectId);

    const indexed = db.prepare(`
      SELECT
        units.unit_pk,
        search.rowid AS search_rowid,
        search.unit_key,
        search.project_id,
        search.external_id,
        search.source_text,
        search.target_text,
        search.metadata_text
      FROM translation_units AS units
      JOIN translation_search AS search ON search.unit_key = units.row_id
      WHERE units.row_id = ?
    `).get("row-1") as {
      unit_pk: number;
      search_rowid: number;
      unit_key: string;
      project_id: string;
      external_id: string;
      source_text: string;
      target_text: string;
      metadata_text: string;
    };
    expect(indexed.search_rowid).toBe(indexed.unit_pk);
    expect(indexed).toMatchObject({
      unit_key: "row-1",
      project_id: projectId,
      external_id: "external-123",
      source_text: "Original source",
      target_text: "Original target",
      metadata_text: JSON.stringify({ note: "factory safety warning" }),
    });
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_search
      WHERE translation_search MATCH ?
    `).get("external")).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_search
      WHERE translation_search MATCH ?
    `).get("safety")).toEqual({ count: 1 });
  });

  it("replaces searchable content when a translation unit is updated", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);
    seedTranslationUnit(db, projectId);
    const { unit_pk: unitPk } = db.prepare(
      "SELECT unit_pk FROM translation_units WHERE row_id = ?",
    ).get("row-1") as { unit_pk: number };
    db.prepare(`
      INSERT INTO translation_search (
        rowid, unit_key, project_id, external_id, source_text, target_text, metadata_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      500,
      "row-1",
      projectId,
      "decoy-external",
      "decoy source",
      "decoy target",
      "{}",
    );

    db.prepare(`
      UPDATE translation_units
      SET
        external_id = ?,
        source_text = ?,
        target_text = ?,
        metadata_json = ?
      WHERE row_id = ?
    `).run(
      "updated-456",
      "Updated source",
      "Updated target",
      JSON.stringify({ note: "revised calibration guidance" }),
      "row-1",
    );

    expect(db.prepare(`
      SELECT rowid, external_id, source_text, target_text, metadata_text
      FROM translation_search
      WHERE rowid = ?
    `).get(unitPk)).toEqual({
      rowid: unitPk,
      external_id: "updated-456",
      source_text: "Updated source",
      target_text: "Updated target",
      metadata_text: JSON.stringify({ note: "revised calibration guidance" }),
    });
    expect(db.prepare(`
      SELECT unit_key, external_id
      FROM translation_search
      WHERE rowid = ?
    `).get(500)).toEqual({ unit_key: "row-1", external_id: "decoy-external" });
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_search
      WHERE translation_search MATCH ?
    `).get("original")).toEqual({ count: 0 });
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_search
      WHERE translation_search MATCH ?
    `).get("calibration")).toEqual({ count: 1 });
  });

  it("removes search content when a translation unit is deleted", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);
    seedTranslationUnit(db, projectId);
    const { unit_pk: unitPk } = db.prepare(
      "SELECT unit_pk FROM translation_units WHERE row_id = ?",
    ).get("row-1") as { unit_pk: number };
    db.prepare(`
      INSERT INTO translation_search (
        rowid, unit_key, project_id, external_id, source_text, target_text, metadata_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      500,
      "row-1",
      projectId,
      "decoy-external",
      "decoy source",
      "decoy target",
      "{}",
    );

    db.prepare("DELETE FROM translation_units WHERE row_id = ?").run("row-1");

    expect(db.prepare(
      "SELECT rowid FROM translation_search WHERE rowid = ?",
    ).get(unitPk)).toBeUndefined();
    expect(db.prepare(`
      SELECT unit_key, external_id
      FROM translation_search
      WHERE rowid = ?
    `).get(500)).toEqual({ unit_key: "row-1", external_id: "decoy-external" });
  });

  it("keeps declared unit keys and FTS rowids aligned after file-database VACUUM", () => {
    const testDatabase = createTemporaryTestDatabase();
    databases.push(testDatabase);
    const { db } = testDatabase;
    const { repository } = createRepository(db);
    const projectId = createProject(repository);
    const insert = db.prepare(`
      INSERT INTO translation_units (
        row_id, project_id, ordinal, external_id, source_lang, source_text,
        target_lang, target_text, original_target_text, status, duplicate_key,
        metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ordinal of [1, 2, 3]) {
      insert.run(
        `vacuum-row-${ordinal}`,
        projectId,
        ordinal,
        `vacuum-external-${ordinal}`,
        "zh-CN",
        `真空测试 ${ordinal}`,
        "en-US",
        `Vacuum marker ${ordinal}`,
        `Vacuum marker ${ordinal}`,
        "original",
        null,
        "{}",
        FIRST_TIMESTAMP.toISOString(),
      );
    }
    db.prepare("DELETE FROM translation_units WHERE row_id = ?").run("vacuum-row-2");
    const identitySql = `
      SELECT units.row_id, units.unit_pk, search.rowid AS search_rowid
      FROM translation_units AS units
      JOIN translation_search AS search ON search.rowid = units.unit_pk
      ORDER BY units.row_id
    `;
    const before = db.prepare(identitySql).all();

    db.exec("VACUUM");

    const after = db.prepare(identitySql).all();
    expect(after).toEqual(before);
    expect(after).toEqual([
      { row_id: "vacuum-row-1", unit_pk: 1, search_rowid: 1 },
      { row_id: "vacuum-row-3", unit_pk: 3, search_rowid: 3 },
    ]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM translation_search
      WHERE translation_search MATCH ?
    `).get("Vacuum marker")).toEqual({ count: 2 });
  });
});

describe("ProjectRepository", () => {
  it("creates an importing project and maps snake_case storage to camelCase", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);

    const project = repository.createProject({
      name: "  Service Manual  ",
      sourceFileName: "manual.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US", "de-DE"],
      fileSize: 4_096,
      skippedUnits: 3,
    });

    expect(project).toEqual({
      id: "project-1",
      name: "Service Manual",
      fileName: "manual.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US", "de-DE"],
      totalUnits: 0,
      changedUnits: 0,
      emptyUnits: 0,
      skippedUnits: 3,
      importStatus: "importing",
      fileSize: 4_096,
      importedAt: FIRST_TIMESTAMP.toISOString(),
      createdAt: FIRST_TIMESTAMP.toISOString(),
      updatedAt: FIRST_TIMESTAMP.toISOString(),
    });

    const stored = db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id) as {
      source_file_name: string;
      target_languages: string;
      imported_at: string;
    };
    expect(stored.source_file_name).toBe("manual.tmx");
    expect(JSON.parse(stored.target_languages)).toEqual(["en-US", "de-DE"]);
    expect(stored.imported_at).toBe(FIRST_TIMESTAMP.toISOString());
  });

  it("lists projects by updated_at descending", () => {
    const { db } = useTestDatabase();
    const { repository, setNow } = createRepository(db);
    createProject(repository, "First");
    setNow(SECOND_TIMESTAMP);
    createProject(repository, "Second");

    expect(repository.listProjects().map((project) => project.name)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("gets project detail and returns null for an unknown project", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);

    expect(repository.getProject(projectId)).toMatchObject({
      id: projectId,
      fileSize: 1_024,
      importedAt: FIRST_TIMESTAMP.toISOString(),
    });
    expect(repository.getProject("missing")).toBeNull();
  });

  it("renames with trimmed validation and updates the timestamp", () => {
    const { db } = useTestDatabase();
    const { repository, setNow } = createRepository(db);
    const projectId = createProject(repository);
    setNow(SECOND_TIMESTAMP);

    const renamed = repository.renameProject(projectId, "  Updated Manual  ");

    expect(renamed.name).toBe("Updated Manual");
    expect(renamed.updatedAt).toBe(SECOND_TIMESTAMP.toISOString());
    expect(() => repository.renameProject(projectId, "   ")).toThrow(/project name/i);
    expect(repository.getProject(projectId)?.name).toBe("Updated Manual");
  });

  it("rejects an empty project name during creation", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);

    expect(() => repository.createProject({
      name: "\t ",
      sourceFileName: "empty.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: [],
      fileSize: 0,
    })).toThrow(/project name/i);
  });

  it("moves a project through importing, ready, and failed statuses", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);

    expect(repository.getProject(projectId)?.importStatus).toBe("importing");
    expect(repository.setImportStatus(projectId, "ready").importStatus).toBe("ready");
    expect(repository.setImportStatus(projectId, "failed").importStatus).toBe("failed");
  });

  it("updates project counters and the modification timestamp", () => {
    const { db } = useTestDatabase();
    const { repository, setNow } = createRepository(db);
    const projectId = createProject(repository);
    setNow(SECOND_TIMESTAMP);

    const updated = repository.updateCounters(projectId, {
      totalUnits: 2_000,
      changedUnits: 12,
      emptyUnits: 7,
      skippedUnits: 4,
    });

    expect(updated).toMatchObject({
      totalUnits: 2_000,
      changedUnits: 12,
      emptyUnits: 7,
      skippedUnits: 4,
      updatedAt: SECOND_TIMESTAMP.toISOString(),
    });
  });

  it("treats an empty counter update as a no-op", () => {
    const { db } = useTestDatabase();
    const { repository, setNow } = createRepository(db);
    const projectId = createProject(repository);
    setNow(SECOND_TIMESTAMP);

    const unchanged = repository.updateCounters(projectId, {});

    expect(unchanged.updatedAt).toBe(FIRST_TIMESTAMP.toISOString());
    expect(db.prepare(
      "SELECT updated_at FROM projects WHERE id = ?",
    ).get(projectId)).toEqual({ updated_at: FIRST_TIMESTAMP.toISOString() });
  });

  it.each([
    ["changedUnits", "changed_units"],
    ["emptyUnits", "empty_units"],
  ] as const)(
    "rejects %s above totalUnits in the repository and database schema",
    (counterName, columnName) => {
      const { db } = useTestDatabase();
      const { repository } = createRepository(db);
      const projectId = createProject(repository);

      expect(() => repository.updateCounters(projectId, {
        totalUnits: 1,
        [counterName]: 2,
      })).toThrow(new RegExp(`${counterName} cannot exceed totalUnits`, "i"));
      expect(() => db.prepare(`
        UPDATE projects
        SET total_units = 1, ${columnName} = 2
        WHERE id = ?
      `).run(projectId)).toThrow(/check constraint failed/i);
    },
  );

  it("allows changed and empty counters to overlap", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);

    expect(repository.updateCounters(projectId, {
      totalUnits: 1,
      changedUnits: 1,
      emptyUnits: 1,
    })).toMatchObject({
      totalUnits: 1,
      changedUnits: 1,
      emptyUnits: 1,
    });
  });

  it("deletes a project with its translation and FTS children", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);

    seedTranslationUnit(db, projectId);

    repository.deleteProject(projectId);

    expect(db.prepare("SELECT COUNT(*) AS count FROM projects").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM translation_units").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM translation_search").get()).toEqual({ count: 0 });
  });

  it("rolls back translation and FTS deletion when project deletion fails", () => {
    const { db } = useTestDatabase();
    const { repository } = createRepository(db);
    const projectId = createProject(repository);
    seedTranslationUnit(db, projectId);
    db.exec(`
      CREATE TRIGGER block_project_delete
      BEFORE DELETE ON projects
      BEGIN
        SELECT RAISE(ABORT, 'project delete blocked');
      END
    `);

    expect(() => repository.deleteProject(projectId)).toThrow(/project delete blocked/i);

    expect(db.prepare("SELECT COUNT(*) AS count FROM projects").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM translation_units").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM translation_search").get()).toEqual({ count: 1 });
  });
});
