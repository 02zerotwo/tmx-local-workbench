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
  confirmAppClose: () => Promise<void>;
  onImportProgress: (listener: (progress: ImportProgress) => void) => () => void;
  onExportProgress: (listener: (progress: ExportProgress) => void) => () => void;
  onAppCloseRequested: (listener: () => void) => () => void;
};
