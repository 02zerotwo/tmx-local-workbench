import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  PROJECT_PAGE_SIZES,
  type FilterStatus,
  type ProjectPageSize,
  type ProjectQuery,
  type ProjectQueryResult,
  type TranslationHistoryEntry,
  type TranslationTextUpdate,
  type TranslationUnitRow,
} from "../../src/lib/desktop-types";

export type InsertTranslationUnit = {
  rowId?: string;
  id: string;
  position: number;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
  originalTargetText: string;
  duplicateKey?: string | null;
  metadata?: Record<string, string>;
};

export type UnitRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type UnitStatus = "original" | "changed" | "empty";

type UnitDatabaseRow = {
  unit_pk: number;
  row_id: string;
  project_id: string;
  ordinal: number;
  external_id: string;
  source_lang: string;
  source_text: string;
  original_source_text: string;
  target_lang: string;
  target_text: string;
  original_target_text: string;
  changed: number;
  is_empty: number;
  status: UnitStatus;
  duplicate_key: string | null;
  metadata_json: string;
  updated_at: string;
};

type ProjectStatusRow = {
  import_status: "importing" | "ready" | "failed";
};

type TranslationHistoryDatabaseRow = {
  project_id: string;
  row_id: string;
  version: number;
  previous_source_text: string;
  source_text: string;
  previous_target_text: string;
  target_text: string;
  changed_at: string;
};

type DerivedState = {
  changed: number;
  isEmpty: number;
  status: UnitStatus;
};

type QueryParts = {
  whereSql: string;
  values: Array<string | number>;
};

const FILTER_STATUSES: readonly FilterStatus[] = ["all", "empty", "changed"];

function deriveState(
  sourceText: string,
  originalSourceText: string,
  targetText: string,
  originalTargetText: string,
): DerivedState {
  const changed = Number(
    sourceText !== originalSourceText || targetText !== originalTargetText,
  );
  const isEmpty = Number(targetText.trim().length === 0);

  return {
    changed,
    isEmpty,
    status: isEmpty ? "empty" : changed ? "changed" : "original",
  };
}

function parseMetadata(metadataJson: string): Record<string, string> {
  const parsed: unknown = JSON.parse(metadataJson);

  if (
    !parsed
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || !Object.values(parsed).every((value) => typeof value === "string")
  ) {
    throw new Error("Stored translation metadata is invalid");
  }

  return parsed as Record<string, string>;
}

function validateMetadata(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Translation metadata must be a plain object with string values");
  }

  const prototype = Object.getPrototypeOf(metadata);
  if (
    (prototype !== Object.prototype && prototype !== null)
    || Object.getOwnPropertySymbols(metadata).length > 0
    || !Object.values(metadata).every((value) => typeof value === "string")
  ) {
    throw new Error("Translation metadata must be a plain object with string values");
  }

  return metadata as Record<string, string>;
}

function mapUnitRow(row: UnitDatabaseRow): TranslationUnitRow {
  return {
    rowId: row.row_id,
    projectId: row.project_id,
    id: row.external_id,
    position: row.ordinal,
    sourceLang: row.source_lang,
    sourceText: row.source_text,
    originalSourceText: row.original_source_text,
    targetLang: row.target_lang,
    targetText: row.target_text,
    originalTargetText: row.original_target_text,
    changed: row.changed === 1,
    duplicate: row.duplicate_key !== null,
    metadata: parseMetadata(row.metadata_json),
    updatedAt: row.updated_at,
  };
}

function mapHistoryRow(row: TranslationHistoryDatabaseRow): TranslationHistoryEntry {
  return {
    projectId: row.project_id,
    rowId: row.row_id,
    version: row.version,
    previousSourceText: row.previous_source_text,
    sourceText: row.source_text,
    previousTargetText: row.previous_target_text,
    targetText: row.target_text,
    changedAt: row.changed_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function validatePageSize(pageSize: ProjectPageSize): ProjectPageSize {
  if (!(PROJECT_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    throw new Error(`Unsupported page size: ${pageSize}`);
  }

  return pageSize;
}

function normalizeRequestedPage(page: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.trunc(page));
}

function validatePosition(position: number): number {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error(`Translation position must be a non-negative integer: ${position}`);
  }

  return position;
}

function buildQueryParts(query: ProjectQuery): QueryParts {
  const conditions = ["u.project_id = ?"];
  const values: Array<string | number> = [query.projectId];
  const { filters } = query;

  if (!FILTER_STATUSES.includes(filters.status)) {
    throw new Error(`Unsupported translation status: ${filters.status}`);
  }

  if (filters.targetLanguage) {
    conditions.push("u.target_lang = ?");
    values.push(filters.targetLanguage);
  }

  if (filters.status === "changed") {
    conditions.push("u.changed = 1");
  } else if (filters.status === "empty") {
    conditions.push("u.is_empty = 1");
  }

  if (filters.duplicateOnly) {
    conditions.push("u.duplicate_key IS NOT NULL");
  }

  // 搜索框只对原文（source_text）与译文（target_text）做 LIKE 模糊匹配。
  // 不搜 external_id / metadata_json：元数据里是导入时的文档级属性（x-document 文件名、
  // client、domain 等），用户在列表里看不到，搜它会命中一堆原文/译文都不含关键词的行。
  // 用户输入中的 \ % _ 会被转义，避免通配符污染查询。
  const searchText = filters.query.trim();
  if (searchText) {
    const likePattern = `%${escapeLike(searchText)}%`;
    conditions.push(`(
      u.source_text LIKE ? ESCAPE '\\'
      OR u.target_text LIKE ? ESCAPE '\\'
    )`);
    values.push(likePattern, likePattern);
  }

  return {
    whereSql: conditions.join(" AND "),
    values,
  };
}

export class UnitRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly projectExistsStatement: Database.Statement;
  private readonly projectStatusStatement: Database.Statement;
  private readonly insertUnitStatement: Database.Statement;
  private readonly finalizeDuplicateKeysStatement: Database.Statement;
  private readonly incrementProjectCountersStatement: Database.Statement;
  private readonly getUnitStatement: Database.Statement;
  private readonly updateUnitStatement: Database.Statement;
  private readonly insertHistoryStatement: Database.Statement;
  private readonly getHistoryStatement: Database.Statement;
  private readonly updateProjectEditCountersStatement: Database.Statement;
  private readonly countStatementCache = new Map<string, Database.Statement>();
  private readonly pageStatementCache = new Map<string, Database.Statement>();
  private readonly insertUnitsTransaction: (
    projectId: string,
    units: InsertTranslationUnit[],
  ) => void;
  private readonly updateTranslationTransaction: (
    projectId: string,
    rowId: string,
    update: TranslationTextUpdate,
  ) => TranslationUnitRow;

  constructor(
    private readonly db: Database.Database,
    options: UnitRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.projectExistsStatement = db.prepare("SELECT 1 FROM projects WHERE id = ?");
    this.projectStatusStatement = db.prepare(
      "SELECT import_status FROM projects WHERE id = ?",
    );
    this.insertUnitStatement = db.prepare(`
      INSERT INTO translation_units (
        row_id, project_id, ordinal, external_id, source_lang, source_text,
        original_source_text, target_lang, target_text, original_target_text,
        changed, is_empty, status, duplicate_key, metadata_json, updated_at
      ) VALUES (
        @rowId, @projectId, @position, @externalId, @sourceLang, @sourceText,
        @originalSourceText, @targetLang, @targetText, @originalTargetText,
        @changed, @isEmpty, @status, @duplicateKey, @metadataJson, @updatedAt
      )
    `);
    this.incrementProjectCountersStatement = db.prepare(`
      UPDATE projects
      SET
        total_units = total_units + @totalDelta,
        changed_units = changed_units + @changedDelta,
        empty_units = empty_units + @emptyDelta,
        updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.finalizeDuplicateKeysStatement = db.prepare(`
      UPDATE translation_units
      SET duplicate_key = NULL
      WHERE project_id = @projectId
        AND duplicate_key IS NOT NULL
        AND duplicate_key IN (
          SELECT duplicate_key
          FROM translation_units
          WHERE project_id = @projectId AND duplicate_key IS NOT NULL
          GROUP BY duplicate_key
          HAVING COUNT(*) = 1
        )
    `);
    this.getUnitStatement = db.prepare(`
      SELECT *
      FROM translation_units
      WHERE project_id = ? AND row_id = ?
    `);
    this.updateUnitStatement = db.prepare(`
      UPDATE translation_units
      SET
        source_text = @sourceText,
        target_text = @targetText,
        changed = @changed,
        is_empty = @isEmpty,
        status = @status,
        updated_at = @updatedAt
      WHERE project_id = @projectId AND row_id = @rowId
    `);
    this.insertHistoryStatement = db.prepare(`
      INSERT INTO translation_unit_history (
        project_id, row_id, version, previous_source_text, source_text,
        previous_target_text, target_text, changed_at
      )
      SELECT
        @projectId,
        @rowId,
        COALESCE(MAX(version), 0) + 1,
        @previousSourceText,
        @sourceText,
        @previousTargetText,
        @targetText,
        @changedAt
      FROM translation_unit_history
      WHERE project_id = @projectId AND row_id = @rowId
    `);
    this.getHistoryStatement = db.prepare(`
      SELECT
        project_id,
        row_id,
        version,
        previous_source_text,
        source_text,
        previous_target_text,
        target_text,
        changed_at
      FROM translation_unit_history
      WHERE project_id = ? AND row_id = ?
      ORDER BY version DESC
    `);
    this.updateProjectEditCountersStatement = db.prepare(`
      UPDATE projects
      SET
        changed_units = changed_units + @changedDelta,
        empty_units = empty_units + @emptyDelta,
        updated_at = @updatedAt
      WHERE id = @projectId
    `);
    this.insertUnitsTransaction = db.transaction((projectId, units) => {
      this.requireProject(projectId);

      if (units.length === 0) {
        return;
      }

      const updatedAt = this.now().toISOString();
      let changedDelta = 0;
      let emptyDelta = 0;

      for (const input of units) {
        const state = deriveState(
          input.sourceText,
          input.sourceText,
          input.targetText,
          input.originalTargetText,
        );
        const metadata = input.metadata === undefined
          ? {}
          : validateMetadata(input.metadata);
        changedDelta += state.changed;
        emptyDelta += state.isEmpty;
        this.insertUnitStatement.run({
          rowId: input.rowId ?? this.createId(),
          projectId,
          position: validatePosition(input.position),
          externalId: input.id,
          sourceLang: input.sourceLang,
          sourceText: input.sourceText,
          originalSourceText: input.sourceText,
          targetLang: input.targetLang,
          targetText: input.targetText,
          originalTargetText: input.originalTargetText,
          changed: state.changed,
          isEmpty: state.isEmpty,
          status: state.status,
          duplicateKey: input.duplicateKey ?? null,
          metadataJson: JSON.stringify(metadata),
          updatedAt,
        });
      }

      this.incrementProjectCountersStatement.run({
        projectId,
        totalDelta: units.length,
        changedDelta,
        emptyDelta,
        updatedAt,
      });
    });
    this.updateTranslationTransaction = db.transaction((projectId, rowId, update) => {
      this.requireProject(projectId);
      const current = this.getUnitStatement.get(projectId, rowId) as
        | UnitDatabaseRow
        | undefined;

      if (!current) {
        throw new Error(`Translation unit not found: ${rowId}`);
      }

      if (
        current.source_text === update.sourceText
        && current.target_text === update.targetText
      ) {
        return mapUnitRow(current);
      }

      const state = deriveState(
        update.sourceText,
        current.original_source_text,
        update.targetText,
        current.original_target_text,
      );
      const updatedAt = this.now().toISOString();
      this.updateUnitStatement.run({
        projectId,
        rowId,
        sourceText: update.sourceText,
        targetText: update.targetText,
        changed: state.changed,
        isEmpty: state.isEmpty,
        status: state.status,
        updatedAt,
      });
      this.insertHistoryStatement.run({
        projectId,
        rowId,
        previousSourceText: current.source_text,
        sourceText: update.sourceText,
        previousTargetText: current.target_text,
        targetText: update.targetText,
        changedAt: updatedAt,
      });
      this.updateProjectEditCountersStatement.run({
        projectId,
        changedDelta: state.changed - current.changed,
        emptyDelta: state.isEmpty - current.is_empty,
        updatedAt,
      });

      return mapUnitRow(this.requireUnit(projectId, rowId));
    });
  }

  insertUnits(projectId: string, units: InsertTranslationUnit[]): void {
    this.insertUnitsTransaction(projectId, units);
  }

  finalizeDuplicateKeys(projectId: string): void {
    this.requireProject(projectId);
    this.finalizeDuplicateKeysStatement.run({ projectId });
  }

  queryProject(query: ProjectQuery): ProjectQueryResult {
    this.requireReadyProject(query.projectId, "accessed");
    const pageSize = validatePageSize(query.pageSize);
    const { whereSql, values } = buildQueryParts(query);
    const countSql = `
      SELECT COUNT(*) AS total
      FROM translation_units u
      WHERE ${whereSql}
    `;
    const countRow = this.prepareCached(
      this.countStatementCache,
      countSql,
    ).get(...values) as { total: number };
    const total = countRow.total;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(normalizeRequestedPage(query.page), pageCount);
    const offset = (page - 1) * pageSize;
    const pageSql = `
      SELECT u.*
      FROM translation_units u
      WHERE ${whereSql}
      ORDER BY u.ordinal ASC, u.row_id ASC
      LIMIT ? OFFSET ?
    `;
    const rows = this.prepareCached(
      this.pageStatementCache,
      pageSql,
    ).all(...values, pageSize, offset) as UnitDatabaseRow[];

    return {
      rows: rows.map(mapUnitRow),
      total,
      page,
      pageSize,
      pageCount,
    };
  }

  updateTranslation(
    projectId: string,
    rowId: string,
    update: TranslationTextUpdate,
  ): TranslationUnitRow {
    this.requireReadyProject(projectId, "edited");
    return this.updateTranslationTransaction(projectId, rowId, update);
  }

  getTranslationHistory(
    projectId: string,
    rowId: string,
  ): TranslationHistoryEntry[] {
    this.requireProject(projectId);
    const rows = this.getHistoryStatement.all(
      projectId,
      rowId,
    ) as TranslationHistoryDatabaseRow[];

    return rows.map(mapHistoryRow);
  }

  private requireProject(projectId: string): void {
    if (!this.projectExistsStatement.get(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
  }

  private requireReadyProject(projectId: string, action: "accessed" | "edited"): void {
    const project = this.projectStatusStatement.get(projectId) as
      | ProjectStatusRow
      | undefined;

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.import_status !== "ready") {
      throw new Error(
        `Project is not ready and cannot be ${action}: ${projectId}`,
      );
    }
  }

  private requireUnit(projectId: string, rowId: string): UnitDatabaseRow {
    const row = this.getUnitStatement.get(projectId, rowId) as
      | UnitDatabaseRow
      | undefined;

    if (!row) {
      throw new Error(`Translation unit not found: ${rowId}`);
    }

    return row;
  }

  private prepareCached(
    cache: Map<string, Database.Statement>,
    sql: string,
  ): Database.Statement {
    const cached = cache.get(sql);
    if (cached) {
      return cached;
    }

    const statement = this.db.prepare(sql);
    cache.set(sql, statement);
    return statement;
  }
}
