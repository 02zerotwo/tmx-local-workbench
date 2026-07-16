export const PROJECT_PAGE_SIZES = [100, 200, 500] as const;

export type ProjectPageSize = (typeof PROJECT_PAGE_SIZES)[number];

export type FilterStatus = "all" | "empty" | "changed";

export type ProjectImportStatus = "importing" | "ready" | "failed";

export type ProjectSummary = {
  id: string;
  name: string;
  fileName: string;
  sourceLanguage: string;
  targetLanguages: string[];
  totalUnits: number;
  changedUnits: number;
  emptyUnits: number;
  skippedUnits: number;
  importStatus: ProjectImportStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  fileSize: number;
  importedAt: string;
};

export type TranslationUnitRow = {
  rowId: string;
  projectId: string;
  id: string;
  position: number;
  sourceLang: string;
  sourceText: string;
  originalSourceText: string;
  targetLang: string;
  targetText: string;
  originalTargetText: string;
  changed: boolean;
  duplicate: boolean;
  metadata: Record<string, string>;
  updatedAt: string;
};

export type TranslationTextUpdate = {
  sourceText: string;
  targetText: string;
};

export type TranslationHistoryEntry = {
  projectId: string;
  rowId: string;
  version: number;
  previousSourceText: string;
  sourceText: string;
  previousTargetText: string;
  targetText: string;
  changedAt: string;
};

export type ProjectFilters = {
  query: string;
  targetLanguage: string;
  status: FilterStatus;
  duplicateOnly: boolean;
};

export type ProjectQuery = {
  projectId: string;
  filters: ProjectFilters;
  page: number;
  pageSize: ProjectPageSize;
};

export type ProjectQueryResult = {
  rows: TranslationUnitRow[];
  total: number;
  page: number;
  pageSize: ProjectPageSize;
  pageCount: number;
};

export type ImportProgress = {
  operationId: string;
  projectId: string;
  stage: "reading" | "parsing" | "saving" | "complete" | "error";
  processed: number;
  total: number;
  percent: number;
  message: string;
};

export type ExportProgress = {
  operationId: string;
  projectId: string;
  stage: "querying" | "writing" | "complete" | "error";
  processed: number;
  total: number;
  percent: number;
  message: string;
};

export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";

export type DeepSeekSettingsStatus = {
  configured: boolean;
  maskedKey: string | null;
  model: DeepSeekModelId;
  verifiedAt: string | null;
};

export type AiSessionRecord = {
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

export type AiToolPartState =
  | "input-available"
  | "output-available"
  | "output-error";

/** 有序消息片段：文本、推理、工具调用（含入参/出参）。按数组顺序渲染。 */
export type AiMessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      state: AiToolPartState;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

export type AiMessageRecord = {
  id: string;
  sessionId: string;
  parentMessageId: string | null;
  branchId: string;
  role: "user" | "assistant" | "tool" | "system";
  parts: AiMessagePart[];
  status: "streaming" | "complete" | "interrupted" | "error";
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentRevisionStatus = "pending" | "applied" | "ignored" | "stale";

/** Agent 暂存的一条待审阅修改建议。 */
export type AiAgentRevisionRecord = {
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
  status: AiAgentRevisionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
};

export type AiAgentEvent = {
  sessionId: string;
  event:
    | { type: "status"; status: "thinking" | "using-tool" | "complete" }
    | { type: "text-delta"; delta: string }
    | { type: "reasoning-delta"; delta: string }
    | {
        type: "tool";
        toolCallId: string;
        name: string;
        status: "running" | "complete" | "error";
        input?: unknown;
        output?: unknown;
      }
    | { type: "revision"; revision: AiAgentRevisionRecord };
};

export type AiAuditBoundaries = {
  /** 用户自由编写的审查规则/要求，注入到审查模型的系统提示中。 */
  customRules: string;
  minConfidence: number;
  allowRewrite: boolean;
  /** 并发审查条数，1–20。 */
  concurrency: number;
};

/** 可复用的审查默认配置（跨会话持久化，新建任务时预填）。 */
export type AiAuditDefaults = AiAuditBoundaries;

export type AiAuditJobRecord = {
  id: string;
  projectId: string;
  sessionId: string | null;
  filters: ProjectFilters;
  boundaries: AiAuditBoundaries;
  model: string;
  status: "draft" | "queued" | "running" | "paused" | "stopped" | "complete" | "partial_failure" | "applied";
  totalItems: number;
  completedItems: number;
  findingItems: number;
  failedItems: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AiAuditFindingRecord = {
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
  decision: "pending" | "accepted" | "rejected" | "edited" | "skipped" | "stale";
  contentHash: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type AiAuditEvent = {
  jobId: string;
  event:
    | { type: "status"; job: AiAuditJobRecord }
    | { type: "progress"; job: AiAuditJobRecord }
    | { type: "finding"; jobId: string; rowId: string; count: number };
};

export type TmxDesktopApi = {
  listProjects: () => Promise<ProjectSummary[]>;
  getProject: (projectId: string) => Promise<ProjectDetail | null>;
  importProject: () => Promise<ProjectDetail | null>;
  renameProject: (projectId: string, name: string) => Promise<ProjectSummary>;
  deleteProject: (projectId: string) => Promise<void>;
  queryProject: (query: ProjectQuery) => Promise<ProjectQueryResult>;
  updateTranslation: (
    projectId: string,
    rowId: string,
    update: TranslationTextUpdate,
  ) => Promise<TranslationUnitRow>;
  getTranslationHistory: (
    projectId: string,
    rowId: string,
  ) => Promise<TranslationHistoryEntry[]>;
  copyText: (text: string) => Promise<void>;
  exportProject: (projectId: string, filters?: ProjectFilters) => Promise<string | null>;
  openExportDirectory: (filePath: string) => Promise<void>;
  backupDatabase: () => Promise<string | null>;
  restoreDatabase: () => Promise<boolean>;
  openDataDirectory: () => Promise<void>;
  getAiSettings: () => Promise<DeepSeekSettingsStatus>;
  saveDeepSeekKey: (apiKey: string) => Promise<DeepSeekSettingsStatus>;
  verifyDeepSeekConnection: () => Promise<DeepSeekSettingsStatus>;
  deleteDeepSeekKey: () => Promise<DeepSeekSettingsStatus>;
  listAiSessions: (projectId: string) => Promise<AiSessionRecord[]>;
  createAiSession: (projectId: string, title: string) => Promise<AiSessionRecord>;
  listAiMessages: (sessionId: string, branchId?: string) => Promise<AiMessageRecord[]>;
  sendAiMessage: (
    sessionId: string,
    branchId: string,
    content: string,
  ) => Promise<AiMessageRecord>;
  stopAiMessage: (sessionId: string) => Promise<boolean>;
  retryAiMessage: (sessionId: string, branchId: string) => Promise<AiMessageRecord>;
  listAiAuditJobs: (projectId: string) => Promise<AiAuditJobRecord[]>;
  startAiAudit: (
    projectId: string,
    filters: ProjectFilters,
    boundaries: AiAuditBoundaries,
  ) => Promise<AiAuditJobRecord>;
  pauseAiAudit: (jobId: string) => Promise<AiAuditJobRecord>;
  resumeAiAudit: (jobId: string) => Promise<AiAuditJobRecord>;
  listAiAuditFindings: (jobId: string) => Promise<AiAuditFindingRecord[]>;
  decideAiAuditFinding: (
    findingId: string,
    decision: AiAuditFindingRecord["decision"],
    editedTargetText?: string | null,
  ) => Promise<AiAuditFindingRecord>;
  acceptAllAiAuditFindings: (jobId: string) => Promise<number>;
  applyAiAudit: (jobId: string) => Promise<{ applied: number; stale: number }>;
  getAiAuditDefaults: () => Promise<AiAuditDefaults>;
  saveAiAuditDefaults: (defaults: AiAuditDefaults) => Promise<AiAuditDefaults>;
  listAiAgentRevisions: (sessionId: string) => Promise<AiAgentRevisionRecord[]>;
  applyAiAgentRevisions: (
    sessionId: string,
    revisionIds: string[],
  ) => Promise<{ applied: number; stale: number; missing: number }>;
  ignoreAiAgentRevision: (revisionId: string) => Promise<AiAgentRevisionRecord>;
  confirmAppClose: () => Promise<void>;
  onImportProgress: (listener: (progress: ImportProgress) => void) => () => void;
  onExportProgress: (listener: (progress: ExportProgress) => void) => () => void;
  onAppCloseRequested: (listener: () => void) => () => void;
  onAiAgentEvent: (listener: (event: AiAgentEvent) => void) => () => void;
  onAiAuditEvent: (listener: (event: AiAuditEvent) => void) => () => void;
};
