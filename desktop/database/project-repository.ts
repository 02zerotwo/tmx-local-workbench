import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectDetail,
  ProjectImportStatus,
  ProjectSummary,
} from "../../src/lib/desktop-types";

export type CreateProjectInput = {
  id?: string;
  name: string;
  sourceFileName: string;
  sourceLanguage: string;
  targetLanguages: string[];
  fileSize: number;
  skippedUnits?: number;
  importStatus?: ProjectImportStatus;
  importedAt?: Date;
};

export type ProjectCounterUpdate = {
  totalUnits?: number;
  changedUnits?: number;
  emptyUnits?: number;
  skippedUnits?: number;
};

export type CompleteProjectImportInput = {
  sourceLanguage: string;
  targetLanguages: string[];
  skippedUnits: number;
};

export type ProjectRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type ProjectRow = {
  id: string;
  name: string;
  source_file_name: string;
  source_language: string;
  target_languages: string;
  total_units: number;
  changed_units: number;
  empty_units: number;
  skipped_units: number;
  import_status: ProjectImportStatus;
  file_size: number;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

const IMPORT_STATUSES: readonly ProjectImportStatus[] = [
  "importing",
  "ready",
  "failed",
];

function validateProjectName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Project name cannot be empty");
  }

  return normalizedName;
}

function validateCounter(name: string, value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function parseTargetLanguages(value: string): string[] {
  const parsed: unknown = JSON.parse(value);

  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error("Stored target languages are invalid");
  }

  return parsed;
}

function mapProjectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    fileName: row.source_file_name,
    sourceLanguage: row.source_language,
    targetLanguages: parseTargetLanguages(row.target_languages),
    totalUnits: row.total_units,
    changedUnits: row.changed_units,
    emptyUnits: row.empty_units,
    skippedUnits: row.skipped_units,
    importStatus: row.import_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectDetail(row: ProjectRow): ProjectDetail {
  return {
    ...mapProjectSummary(row),
    fileSize: row.file_size,
    importedAt: row.imported_at,
  };
}

export class ProjectRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly insertProjectStatement: Database.Statement;
  private readonly listProjectsStatement: Database.Statement;
  private readonly getProjectStatement: Database.Statement;
  private readonly renameProjectStatement: Database.Statement;
  private readonly setImportStatusStatement: Database.Statement;
  private readonly updateCountersStatement: Database.Statement;
  private readonly completeImportStatement: Database.Statement;
  private readonly failImportStatement: Database.Statement;
  private readonly deleteUnitsStatement: Database.Statement;
  private readonly deleteProjectStatement: Database.Statement;
  private readonly deleteProjectTransaction: (projectId: string) => void;
  private readonly failImportTransaction: (projectId: string) => void;

  constructor(
    private readonly db: Database.Database,
    options: ProjectRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.insertProjectStatement = db.prepare(`
      INSERT INTO projects (
        id, name, source_file_name, source_language, target_languages,
        skipped_units, import_status, file_size, imported_at, created_at, updated_at
      ) VALUES (
        @id, @name, @sourceFileName, @sourceLanguage, @targetLanguages,
        @skippedUnits, @importStatus, @fileSize, @importedAt, @createdAt, @updatedAt
      )
    `);
    this.listProjectsStatement = db.prepare(
      "SELECT * FROM projects ORDER BY updated_at DESC, id ASC",
    );
    this.getProjectStatement = db.prepare("SELECT * FROM projects WHERE id = ?");
    this.renameProjectStatement = db.prepare(`
      UPDATE projects
      SET name = @name, updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.setImportStatusStatement = db.prepare(`
      UPDATE projects
      SET import_status = @importStatus, updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.updateCountersStatement = db.prepare(`
      UPDATE projects
      SET
        total_units = COALESCE(@totalUnits, total_units),
        changed_units = COALESCE(@changedUnits, changed_units),
        empty_units = COALESCE(@emptyUnits, empty_units),
        skipped_units = COALESCE(@skippedUnits, skipped_units),
        updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.completeImportStatement = db.prepare(`
      UPDATE projects
      SET
        source_language = @sourceLanguage,
        target_languages = @targetLanguages,
        skipped_units = @skippedUnits,
        import_status = 'ready',
        updated_at = @updatedAt
      WHERE id = @projectId AND import_status = 'importing'
    `);
    this.failImportStatement = db.prepare(`
      UPDATE projects
      SET
        total_units = 0,
        changed_units = 0,
        empty_units = 0,
        skipped_units = 0,
        import_status = 'failed',
        updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.deleteUnitsStatement = db.prepare(
      "DELETE FROM translation_units WHERE project_id = ?",
    );
    this.deleteProjectStatement = db.prepare("DELETE FROM projects WHERE id = ?");
    this.deleteProjectTransaction = db.transaction((projectId: string) => {
      this.deleteUnitsStatement.run(projectId);
      this.deleteProjectStatement.run(projectId);
    });
    this.failImportTransaction = db.transaction((projectId: string) => {
      this.requireProjectRow(projectId);
      this.deleteUnitsStatement.run(projectId);
      this.failImportStatement.run({
        projectId,
        updatedAt: this.now().toISOString(),
      });
    });
  }

  createProject(input: CreateProjectInput): ProjectDetail {
    const timestamp = this.now().toISOString();
    const importedAt = (input.importedAt ?? new Date(timestamp)).toISOString();
    const id = input.id ?? this.createId();
    const name = validateProjectName(input.name);
    const skippedUnits = validateCounter("skippedUnits", input.skippedUnits) ?? 0;
    const fileSize = validateCounter("fileSize", input.fileSize);
    const importStatus = input.importStatus ?? "importing";

    if (!IMPORT_STATUSES.includes(importStatus)) {
      throw new Error(`Invalid import status: ${importStatus}`);
    }

    this.insertProjectStatement.run({
      id,
      name,
      sourceFileName: input.sourceFileName,
      sourceLanguage: input.sourceLanguage,
      targetLanguages: JSON.stringify(input.targetLanguages),
      skippedUnits,
      importStatus,
      fileSize,
      importedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return this.requireProject(id);
  }

  listProjects(): ProjectSummary[] {
    return (this.listProjectsStatement.all() as ProjectRow[]).map(mapProjectSummary);
  }

  getProject(projectId: string): ProjectDetail | null {
    const row = this.getProjectStatement.get(projectId) as ProjectRow | undefined;
    return row ? mapProjectDetail(row) : null;
  }

  renameProject(projectId: string, name: string): ProjectSummary {
    const result = this.renameProjectStatement.run({
      projectId,
      name: validateProjectName(name),
      updatedAt: this.now().toISOString(),
    });
    this.assertProjectUpdated(result.changes, projectId);
    return mapProjectSummary(this.requireProjectRow(projectId));
  }

  setImportStatus(
    projectId: string,
    importStatus: ProjectImportStatus,
  ): ProjectSummary {
    if (!IMPORT_STATUSES.includes(importStatus)) {
      throw new Error(`Invalid import status: ${importStatus}`);
    }

    const result = this.setImportStatusStatement.run({
      projectId,
      importStatus,
      updatedAt: this.now().toISOString(),
    });
    this.assertProjectUpdated(result.changes, projectId);
    return mapProjectSummary(this.requireProjectRow(projectId));
  }

  updateCounters(
    projectId: string,
    counters: ProjectCounterUpdate,
  ): ProjectSummary {
    const current = this.requireProjectRow(projectId);

    if (
      counters.totalUnits === undefined
      && counters.changedUnits === undefined
      && counters.emptyUnits === undefined
      && counters.skippedUnits === undefined
    ) {
      return mapProjectSummary(current);
    }

    const totalUnits = validateCounter("totalUnits", counters.totalUnits)
      ?? current.total_units;
    const changedUnits = validateCounter("changedUnits", counters.changedUnits)
      ?? current.changed_units;
    const emptyUnits = validateCounter("emptyUnits", counters.emptyUnits)
      ?? current.empty_units;
    const skippedUnits = validateCounter("skippedUnits", counters.skippedUnits)
      ?? current.skipped_units;

    if (changedUnits > totalUnits) {
      throw new Error("changedUnits cannot exceed totalUnits");
    }

    if (emptyUnits > totalUnits) {
      throw new Error("emptyUnits cannot exceed totalUnits");
    }

    const result = this.updateCountersStatement.run({
      projectId,
      totalUnits,
      changedUnits,
      emptyUnits,
      skippedUnits,
      updatedAt: this.now().toISOString(),
    });
    this.assertProjectUpdated(result.changes, projectId);
    return mapProjectSummary(this.requireProjectRow(projectId));
  }

  completeImport(
    projectId: string,
    input: CompleteProjectImportInput,
  ): ProjectDetail {
    const sourceLanguage = input.sourceLanguage.trim();
    const targetLanguages = Array.from(new Set(
      input.targetLanguages.map((language) => language.trim()).filter(Boolean),
    )).sort((left, right) => left.localeCompare(right));
    const skippedUnits = validateCounter("skippedUnits", input.skippedUnits) ?? 0;
    const result = this.completeImportStatement.run({
      projectId,
      sourceLanguage,
      targetLanguages: JSON.stringify(targetLanguages),
      skippedUnits,
      updatedAt: this.now().toISOString(),
    });

    if (result.changes === 0) {
      this.requireProjectRow(projectId);
      throw new Error(`Project is not importing: ${projectId}`);
    }

    return this.requireProject(projectId);
  }

  failImport(projectId: string): ProjectDetail {
    this.failImportTransaction(projectId);
    return this.requireProject(projectId);
  }

  deleteProject(projectId: string): void {
    this.deleteProjectTransaction(projectId);
  }

  private requireProject(projectId: string): ProjectDetail {
    return mapProjectDetail(this.requireProjectRow(projectId));
  }

  private requireProjectRow(projectId: string): ProjectRow {
    const row = this.getProjectStatement.get(projectId) as ProjectRow | undefined;

    if (!row) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return row;
  }

  private assertProjectUpdated(changes: number, projectId: string): void {
    if (changes === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }
  }
}
