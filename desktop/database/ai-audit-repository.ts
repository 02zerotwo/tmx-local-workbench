import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectFilters } from "../../src/lib/desktop-types";

export type AuditBoundaries = {
  categories: string[];
  minConfidence: number;
  allowRewrite: boolean;
};

export type AuditJobStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused"
  | "stopped"
  | "complete"
  | "partial_failure"
  | "applied";

export type AuditJob = {
  id: string;
  projectId: string;
  sessionId: string | null;
  filters: ProjectFilters;
  boundaries: AuditBoundaries;
  model: string;
  status: AuditJobStatus;
  totalItems: number;
  completedItems: number;
  findingItems: number;
  failedItems: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AuditQueueItem = {
  id: string;
  jobId: string;
  projectId: string;
  rowId: string;
  queueOrdinal: number;
  contentHash: string;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
};

export type AuditFindingDecision =
  | "pending"
  | "accepted"
  | "rejected"
  | "edited"
  | "skipped"
  | "stale";

export type AuditFinding = {
  id: string;
  jobId: string;
  itemId: string;
  projectId: string;
  rowId: string;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  targetText: string;
  category: string;
  severity: "info" | "warning" | "error";
  summary: string;
  evidence: string;
  suggestedTargetText: string | null;
  editedTargetText: string | null;
  confidence: number;
  decision: AuditFindingDecision;
  contentHash: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type NewAuditFinding = Pick<
  AuditFinding,
  | "category"
  | "severity"
  | "summary"
  | "evidence"
  | "suggestedTargetText"
  | "confidence"
  | "contentHash"
  | "model"
  | "promptVersion"
>;

type AuditRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type JobRow = {
  id: string;
  project_id: string;
  session_id: string | null;
  filters_json: string;
  boundaries_json: string;
  model: string;
  status: AuditJobStatus;
  total_items: number;
  completed_items: number;
  finding_items: number;
  failed_items: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

type QueueRow = {
  id: string;
  job_id: string;
  project_id: string;
  row_id: string;
  queue_ordinal: number;
  content_hash: string;
  source_lang: string;
  source_text: string;
  target_lang: string;
  target_text: string;
};

type FindingRow = {
  id: string;
  job_id: string;
  item_id: string;
  project_id: string;
  row_id: string;
  source_lang: string;
  source_text: string;
  target_lang: string;
  target_text: string;
  category: string;
  severity: AuditFinding["severity"];
  summary: string;
  evidence: string;
  suggested_target_text: string | null;
  edited_target_text: string | null;
  confidence: number;
  decision: AuditFindingDecision;
  content_hash: string;
  model: string;
  prompt_version: string;
  created_at: string;
  updated_at: string;
};

function mapJob(row: JobRow): AuditJob {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    filters: JSON.parse(row.filters_json) as ProjectFilters,
    boundaries: JSON.parse(row.boundaries_json) as AuditBoundaries,
    model: row.model,
    status: row.status,
    totalItems: row.total_items,
    completedItems: row.completed_items,
    findingItems: row.finding_items,
    failedItems: row.failed_items,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  };
}

function mapQueueItem(row: QueueRow): AuditQueueItem {
  return {
    id: row.id,
    jobId: row.job_id,
    projectId: row.project_id,
    rowId: row.row_id,
    queueOrdinal: row.queue_ordinal,
    contentHash: row.content_hash,
    sourceLang: row.source_lang,
    sourceText: row.source_text,
    targetLang: row.target_lang,
    targetText: row.target_text,
  };
}

function mapFinding(row: FindingRow): AuditFinding {
  return {
    id: row.id,
    jobId: row.job_id,
    itemId: row.item_id,
    projectId: row.project_id,
    rowId: row.row_id,
    sourceLang: row.source_lang,
    sourceText: row.source_text,
    targetLang: row.target_lang,
    targetText: row.target_text,
    category: row.category,
    severity: row.severity,
    summary: row.summary,
    evidence: row.evidence,
    suggestedTargetText: row.suggested_target_text,
    editedTargetText: row.edited_target_text,
    confidence: row.confidence,
    decision: row.decision,
    contentHash: row.content_hash,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AiAuditRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly db: Database.Database,
    options: AuditRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  createJob(input: {
    projectId: string;
    sessionId?: string | null;
    filters: ProjectFilters;
    boundaries: AuditBoundaries;
    model: string;
    rows: Array<{ rowId: string; contentHash: string }>;
  }): AuditJob {
    const id = this.createId();
    const now = this.now().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO ai_audit_jobs (
          id, project_id, session_id, filters_json, boundaries_json, model,
          status, total_items, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `).run(
        id,
        input.projectId,
        input.sessionId ?? null,
        JSON.stringify(input.filters),
        JSON.stringify(input.boundaries),
        input.model,
        input.rows.length,
        now,
        now,
      );
      const insert = this.db.prepare(`
        INSERT INTO ai_audit_items (
          id, job_id, project_id, row_id, queue_ordinal, content_hash, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      input.rows.forEach((row, index) => {
        insert.run(
          this.createId(),
          id,
          input.projectId,
          row.rowId,
          index + 1,
          row.contentHash,
          now,
        );
      });
    })();
    return this.requireJob(id);
  }

  getJob(jobId: string): AuditJob | null {
    const row = this.db.prepare("SELECT * FROM ai_audit_jobs WHERE id = ?")
      .get(jobId) as JobRow | undefined;
    return row ? mapJob(row) : null;
  }

  listJobs(projectId: string): AuditJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM ai_audit_jobs
      WHERE project_id = ?
      ORDER BY updated_at DESC, id DESC
    `).all(projectId) as JobRow[];
    return rows.map(mapJob);
  }

  recoverInterruptedJobs(): number {
    const now = this.now().toISOString();
    const result = this.db.prepare(`
      UPDATE ai_audit_jobs
      SET status = 'paused', updated_at = ?
      WHERE status = 'running'
    `).run(now);
    return result.changes;
  }

  getNextPendingItem(jobId: string): AuditQueueItem | null {
    const row = this.db.prepare(`
      SELECT i.*, u.source_lang, u.source_text, u.target_lang, u.target_text
      FROM ai_audit_items i
      JOIN translation_units u
        ON u.project_id = i.project_id AND u.row_id = i.row_id
      WHERE i.job_id = ? AND i.status = 'pending'
      ORDER BY i.queue_ordinal ASC
      LIMIT 1
    `).get(jobId) as QueueRow | undefined;
    return row ? mapQueueItem(row) : null;
  }

  setJobStatus(jobId: string, status: AuditJobStatus): AuditJob {
    const now = this.now().toISOString();
    this.db.prepare(`
      UPDATE ai_audit_jobs
      SET status = ?,
          started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
          finished_at = CASE WHEN ? IN ('complete', 'partial_failure', 'stopped', 'applied') THEN ? ELSE finished_at END,
          updated_at = ?
      WHERE id = ?
    `).run(status, status, now, status, now, now, jobId);
    return this.requireJob(jobId);
  }

  recordItemResult(jobId: string, itemId: string, findings: NewAuditFinding[]): void {
    const now = this.now().toISOString();
    this.db.transaction(() => {
      const item = this.db.prepare(`
        SELECT project_id, row_id FROM ai_audit_items
        WHERE id = ? AND job_id = ?
      `).get(itemId, jobId) as { project_id: string; row_id: string } | undefined;
      if (!item) throw new Error("审查队列记录不存在");

      const insert = this.db.prepare(`
        INSERT INTO ai_audit_findings (
          id, job_id, item_id, project_id, row_id, category, severity,
          summary, evidence, suggested_target_text, confidence, content_hash,
          model, prompt_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const finding of findings) {
        insert.run(
          this.createId(),
          jobId,
          itemId,
          item.project_id,
          item.row_id,
          finding.category,
          finding.severity,
          finding.summary,
          finding.evidence,
          finding.suggestedTargetText,
          finding.confidence,
          finding.contentHash,
          finding.model,
          finding.promptVersion,
          now,
          now,
        );
      }
      this.db.prepare(`
        UPDATE ai_audit_items
        SET status = 'complete', finished_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'running')
      `).run(now, now, itemId);
      this.db.prepare(`
        UPDATE ai_audit_jobs
        SET completed_items = completed_items + 1,
            finding_items = finding_items + ?,
            updated_at = ?
        WHERE id = ?
      `).run(findings.length > 0 ? 1 : 0, now, jobId);
    })();
  }

  recordItemFailure(jobId: string, itemId: string, error: string): void {
    const now = this.now().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE ai_audit_items
        SET status = 'failed', attempts = attempts + 1, error = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).run(error, now, now, itemId);
      this.db.prepare(`
        UPDATE ai_audit_jobs
        SET completed_items = completed_items + 1,
            failed_items = failed_items + 1,
            updated_at = ?
        WHERE id = ?
      `).run(now, jobId);
    })();
  }

  listFindings(jobId: string): AuditFinding[] {
    const rows = this.db.prepare(`
      SELECT f.*, u.source_lang, u.source_text, u.target_lang, u.target_text
      FROM ai_audit_findings f
      JOIN translation_units u
        ON u.project_id = f.project_id AND u.row_id = f.row_id
      WHERE f.job_id = ?
      ORDER BY CASE f.severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
               f.created_at ASC, f.id ASC
    `).all(jobId) as FindingRow[];
    return rows.map(mapFinding);
  }

  setFindingDecision(
    findingId: string,
    decision: AuditFindingDecision,
    editedTargetText?: string | null,
  ): AuditFinding {
    const now = this.now().toISOString();
    this.db.prepare(`
      UPDATE ai_audit_findings
      SET decision = ?, edited_target_text = ?, updated_at = ?
      WHERE id = ?
    `).run(decision, editedTargetText ?? null, now, findingId);
    const row = this.db.prepare(`
      SELECT f.*, u.source_lang, u.source_text, u.target_lang, u.target_text
      FROM ai_audit_findings f
      JOIN translation_units u
        ON u.project_id = f.project_id AND u.row_id = f.row_id
      WHERE f.id = ?
    `).get(findingId) as FindingRow | undefined;
    if (!row) throw new Error("审查建议不存在");
    return mapFinding(row);
  }

  acceptAllPendingFindings(jobId: string): number {
    const now = this.now().toISOString();
    const result = this.db.prepare(`
      UPDATE ai_audit_findings
      SET decision = 'accepted', updated_at = ?
      WHERE job_id = ?
        AND decision = 'pending'
        AND suggested_target_text IS NOT NULL
    `).run(now, jobId);
    return result.changes;
  }

  getAcceptedFindings(jobId: string): AuditFinding[] {
    return this.listFindings(jobId).filter((finding) => (
      finding.decision === "accepted" || finding.decision === "edited"
    ));
  }

  private requireJob(jobId: string): AuditJob {
    const job = this.getJob(jobId);
    if (!job) throw new Error("审查任务不存在");
    return job;
  }
}
