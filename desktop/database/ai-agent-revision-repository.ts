import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type AgentRevisionStatus = "pending" | "applied" | "ignored" | "stale";

export type AgentRevision = {
  id: string;
  sessionId: string;
  messageId: string | null;
  toolCallId: string;
  projectId: string;
  rowId: string;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  originalTargetText: string;
  suggestedTargetText: string;
  category: string;
  reason: string;
  confidence: number;
  contentHash: string;
  status: AgentRevisionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
};

export type NewAgentRevision = {
  sessionId: string;
  toolCallId: string;
  projectId: string;
  rowId: string;
  sourceLang: string;
  sourceText: string;
  targetLang: string;
  originalTargetText: string;
  suggestedTargetText: string;
  category: string;
  reason: string;
  confidence: number;
  contentHash: string;
};

type RepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type RevisionRow = {
  id: string;
  session_id: string;
  message_id: string | null;
  tool_call_id: string;
  project_id: string;
  row_id: string;
  source_lang: string;
  source_text: string;
  target_lang: string;
  original_target_text: string;
  suggested_target_text: string;
  category: string;
  reason: string;
  confidence: number;
  content_hash: string;
  status: AgentRevisionStatus;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
};

export class AgentRevisionRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly db: Database.Database,
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  createRevision(input: NewAgentRevision): AgentRevision {
    const id = this.createId();
    const timestamp = this.now().toISOString();
    this.db.prepare(`
      INSERT INTO ai_agent_revisions (
        id, session_id, message_id, tool_call_id, project_id, row_id,
        source_lang, source_text, target_lang, original_target_text,
        suggested_target_text, category, reason, confidence, content_hash,
        status, created_at, updated_at, applied_at
      ) VALUES (
        @id, @sessionId, NULL, @toolCallId, @projectId, @rowId,
        @sourceLang, @sourceText, @targetLang, @originalTargetText,
        @suggestedTargetText, @category, @reason, @confidence, @contentHash,
        'pending', @timestamp, @timestamp, NULL
      )
    `).run({ id, timestamp, ...input });
    return this.getRevision(id)!;
  }

  getRevision(id: string): AgentRevision | null {
    const row = this.db.prepare(`
      SELECT * FROM ai_agent_revisions WHERE id = ?
    `).get(id) as RevisionRow | undefined;
    return row ? mapRevision(row) : null;
  }

  listRevisions(sessionId: string): AgentRevision[] {
    return (this.db.prepare(`
      SELECT * FROM ai_agent_revisions
      WHERE session_id = ?
      ORDER BY created_at, rowid
    `).all(sessionId) as RevisionRow[]).map(mapRevision);
  }

  getRevisionsByIds(ids: string[]): AgentRevision[] {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    return (this.db.prepare(`
      SELECT * FROM ai_agent_revisions WHERE id IN (${placeholders})
    `).all(...ids) as RevisionRow[]).map(mapRevision);
  }

  setStatus(
    id: string,
    status: AgentRevisionStatus,
    appliedAt: string | null = null,
  ): AgentRevision {
    const timestamp = this.now().toISOString();
    this.db.prepare(`
      UPDATE ai_agent_revisions
      SET status = ?, applied_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, appliedAt, timestamp, id);
    const revision = this.getRevision(id);
    if (!revision) {
      throw new Error(`修改建议不存在: ${id}`);
    }
    return revision;
  }

  updateSuggestedTargetText(
    id: string,
    suggestedTargetText: string,
  ): AgentRevision {
    const timestamp = this.now().toISOString();
    this.db.prepare(`
      UPDATE ai_agent_revisions
      SET suggested_target_text = ?, updated_at = ?
      WHERE id = ?
    `).run(suggestedTargetText, timestamp, id);
    const revision = this.getRevision(id);
    if (!revision) {
      throw new Error(`修改建议不存在: ${id}`);
    }
    return revision;
  }

  linkRevisionsToMessage(ids: string[], messageId: string): void {
    if (ids.length === 0) {
      return;
    }
    const update = this.db.prepare(`
      UPDATE ai_agent_revisions SET message_id = ? WHERE id = ?
    `);
    this.db.transaction(() => {
      for (const id of ids) {
        update.run(messageId, id);
      }
    })();
  }
}

function mapRevision(row: RevisionRow): AgentRevision {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    toolCallId: row.tool_call_id,
    projectId: row.project_id,
    rowId: row.row_id,
    sourceLang: row.source_lang,
    sourceText: row.source_text,
    targetLang: row.target_lang,
    originalTargetText: row.original_target_text,
    suggestedTargetText: row.suggested_target_text,
    category: row.category,
    reason: row.reason,
    confidence: row.confidence,
    contentHash: row.content_hash,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at,
  };
}
