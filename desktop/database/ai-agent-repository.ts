import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type AiSession = {
  id: string;
  projectId: string;
  title: string;
  status: "active" | "archived";
  pinned: boolean;
  summary: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type AiMessageStatus = "streaming" | "complete" | "interrupted" | "error";
export type AiMessageRole = "user" | "assistant" | "tool" | "system";

export type AiMessage = {
  id: string;
  sessionId: string;
  parentMessageId: string | null;
  branchId: string;
  role: AiMessageRole;
  parts: unknown[];
  status: AiMessageStatus;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type AiCheckpoint = {
  id: string;
  sessionId: string;
  branchId: string;
  messageId: string | null;
  contextSummary: string;
  pendingAction: unknown | null;
  status: "ready" | "restored" | "superseded";
  createdAt: string;
};

type RepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type SessionRow = {
  id: string;
  project_id: string;
  title: string;
  status: AiSession["status"];
  pinned: number;
  summary: string;
  model: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  parent_message_id: string | null;
  branch_id: string;
  role: AiMessageRole;
  parts_json: string;
  status: AiMessageStatus;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  created_at: string;
  updated_at: string;
};

type CheckpointRow = {
  id: string;
  session_id: string;
  branch_id: string;
  message_id: string | null;
  context_summary: string;
  pending_action_json: string | null;
  status: AiCheckpoint["status"];
  created_at: string;
};

export class AiAgentRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly db: Database.Database,
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  createSession(input: {
    projectId: string;
    title: string;
    model: string;
  }): AiSession {
    const id = this.createId();
    const timestamp = this.now().toISOString();
    this.db.prepare(`
      INSERT INTO ai_agent_sessions (
        id, project_id, title, status, pinned, summary, model, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', 0, '', ?, ?, ?)
    `).run(id, input.projectId, input.title.trim(), input.model, timestamp, timestamp);
    return this.getSession(id)!;
  }

  getSession(sessionId: string): AiSession | null {
    const row = this.db.prepare(`
      SELECT * FROM ai_agent_sessions WHERE id = ?
    `).get(sessionId) as SessionRow | undefined;
    return row ? mapSession(row) : null;
  }

  listSessions(projectId: string): AiSession[] {
    return (this.db.prepare(`
      SELECT * FROM ai_agent_sessions
      WHERE project_id = ? AND status = 'active'
      ORDER BY pinned DESC, updated_at DESC, id DESC
    `).all(projectId) as SessionRow[]).map(mapSession);
  }

  renameSession(sessionId: string, title: string): AiSession {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      throw new Error("会话标题不能为空");
    }
    const timestamp = this.now().toISOString();
    const result = this.db.prepare(`
      UPDATE ai_agent_sessions
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedTitle, timestamp, sessionId);
    if (result.changes !== 1) {
      throw new Error("AI 会话不存在");
    }
    return this.getSession(sessionId)!;
  }

  deleteSession(sessionId: string): true {
    const result = this.db.prepare(`
      DELETE FROM ai_agent_sessions WHERE id = ?
    `).run(sessionId);
    if (result.changes !== 1) {
      throw new Error("AI 会话不存在");
    }
    return true;
  }

  appendMessage(input: {
    sessionId: string;
    parentMessageId?: string | null;
    branchId: string;
    role: AiMessageRole;
    parts: unknown[];
    status: AiMessageStatus;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  }): AiMessage {
    const id = this.createId();
    const timestamp = this.now().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO ai_agent_messages (
          id, session_id, parent_message_id, branch_id, role, parts_json, status,
          input_tokens, output_tokens, reasoning_tokens, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.sessionId,
        input.parentMessageId ?? null,
        input.branchId,
        input.role,
        JSON.stringify(input.parts),
        input.status,
        input.inputTokens ?? 0,
        input.outputTokens ?? 0,
        input.reasoningTokens ?? 0,
        timestamp,
        timestamp,
      );
      this.db.prepare(`
        UPDATE ai_agent_sessions SET updated_at = ? WHERE id = ?
      `).run(timestamp, input.sessionId);
    }).immediate();
    return this.getMessage(id)!;
  }

  getMessage(messageId: string): AiMessage | null {
    const row = this.db.prepare(`
      SELECT * FROM ai_agent_messages WHERE id = ?
    `).get(messageId) as MessageRow | undefined;
    return row ? mapMessage(row) : null;
  }

  listMessages(sessionId: string, branchId: string): AiMessage[] {
    return (this.db.prepare(`
      SELECT * FROM ai_agent_messages
      WHERE session_id = ? AND branch_id = ?
      ORDER BY created_at, rowid
    `).all(sessionId, branchId) as MessageRow[]).map(mapMessage);
  }

  createCheckpoint(input: {
    sessionId: string;
    branchId: string;
    messageId?: string | null;
    contextSummary?: string;
    pendingAction?: unknown | null;
  }): AiCheckpoint {
    const id = this.createId();
    const timestamp = this.now().toISOString();
    this.db.prepare(`
      INSERT INTO ai_agent_checkpoints (
        id, session_id, branch_id, message_id, context_summary,
        pending_action_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)
    `).run(
      id,
      input.sessionId,
      input.branchId,
      input.messageId ?? null,
      input.contextSummary ?? "",
      input.pendingAction === undefined || input.pendingAction === null
        ? null
        : JSON.stringify(input.pendingAction),
      timestamp,
    );
    return this.getCheckpoint(id)!;
  }

  getCheckpoint(checkpointId: string): AiCheckpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM ai_agent_checkpoints WHERE id = ?
    `).get(checkpointId) as CheckpointRow | undefined;
    return row ? mapCheckpoint(row) : null;
  }

  getLatestCheckpoint(sessionId: string, branchId: string): AiCheckpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM ai_agent_checkpoints
      WHERE session_id = ? AND branch_id = ? AND status = 'ready'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(sessionId, branchId) as CheckpointRow | undefined;
    return row ? mapCheckpoint(row) : null;
  }
}

function mapSession(row: SessionRow): AiSession {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    pinned: row.pinned === 1,
    summary: row.summary,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): AiMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentMessageId: row.parent_message_id,
    branchId: row.branch_id,
    role: row.role,
    parts: JSON.parse(row.parts_json) as unknown[],
    status: row.status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCheckpoint(row: CheckpointRow): AiCheckpoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    branchId: row.branch_id,
    messageId: row.message_id,
    contextSummary: row.context_summary,
    pendingAction: row.pending_action_json
      ? JSON.parse(row.pending_action_json) as unknown
      : null,
    status: row.status,
    createdAt: row.created_at,
  };
}
