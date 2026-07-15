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

export type AiMessageRecord = {
  id: string;
  sessionId: string;
  parentMessageId: string | null;
  branchId: string;
  role: "user" | "assistant" | "tool" | "system";
  parts: unknown[];
  status: "streaming" | "complete" | "interrupted" | "error";
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentEvent = {
  sessionId: string;
  event:
    | { type: "status"; status: "thinking" | "using-tool" | "complete" }
    | { type: "text-delta"; delta: string }
    | { type: "reasoning-delta"; delta: string }
    | { type: "tool"; name: string; status: "running" | "complete" | "error" };
};

export type AiAuditBoundaries = {
  categories: string[];
  minConfidence: number;
  allowRewrite: boolean;
};

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
  confirmAppClose: () => Promise<void>;
  onImportProgress: (listener: (progress: ImportProgress) => void) => () => void;
  onExportProgress: (listener: (progress: ExportProgress) => void) => () => void;
  onAppCloseRequested: (listener: () => void) => () => void;
  onAiAgentEvent: (listener: (event: AiAgentEvent) => void) => () => void;
  onAiAuditEvent: (listener: (event: AiAuditEvent) => void) => () => void;
};
