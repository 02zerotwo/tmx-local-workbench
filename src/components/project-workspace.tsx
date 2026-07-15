"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FilterX,
  FolderOpen,
  Languages,
  Loader2,
  Search,
} from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  ExportProgress,
  ProjectQueryResult,
  ProjectSummary,
  TmxDesktopApi,
  TranslationHistoryEntry,
  TranslationTextUpdate,
  TranslationUnitRow,
} from "@/lib/desktop-types";
import {
  createWorkspaceState,
  workspaceReducer,
  type WorkspaceAction,
} from "@/lib/workspace-state";
import { Pagination } from "./pagination";
import {
  TranslationEditor,
  type TranslationEditorHandle,
} from "./translation-editor";
import { TranslationTable } from "./translation-table";

type ProjectWorkspaceProps = {
  api: TmxDesktopApi;
  project: ProjectSummary;
  onBack: () => void;
};

const EMPTY_RESULT: ProjectQueryResult = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 200,
  pageCount: 1,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

export function ProjectWorkspace({ api, project, onBack }: ProjectWorkspaceProps) {
  const [workspace, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    () => createWorkspaceState(),
  );
  const [result, setResult] = useState<ProjectQueryResult>(EMPTY_RESULT);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportedPath, setExportedPath] = useState("");
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editorNonce, setEditorNonce] = useState(0);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const lastSuccessfulPageRef = useRef(1);
  const historyRequestIdRef = useRef(0);
  const selectedRowIdRef = useRef("");
  const pendingPageSelectionRef = useRef<{
    page: number;
    edge: "first" | "last";
  } | null>(null);
  const editorRef = useRef<TranslationEditorHandle>(null);
  const closingRef = useRef(false);
  const exportingRef = useRef(false);

  const {
    filters,
    page,
    pageSize,
  } = workspace;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    api.queryProject({
      projectId: project.id,
      filters,
      page,
      pageSize,
    }).then((nextResult) => {
      if (requestId !== requestIdRef.current) {
        return;
      }
      lastSuccessfulPageRef.current = nextResult.page;
      startTransition(() => {
        setResult(nextResult);
        setSelectedRowId((current) => {
          const pendingSelection = pendingPageSelectionRef.current;
          if (pendingSelection?.page === nextResult.page) {
            pendingPageSelectionRef.current = null;
            return pendingSelection.edge === "last"
              ? nextResult.rows.at(-1)?.rowId ?? ""
              : nextResult.rows[0]?.rowId ?? "";
          }
          return nextResult.rows.some(({ rowId }) => rowId === current)
            ? current
            : nextResult.rows[0]?.rowId ?? "";
        });
      });
      setError("");
    }).catch((queryError: unknown) => {
      if (requestId === requestIdRef.current) {
        pendingPageSelectionRef.current = null;
        setError(errorMessage(queryError));
        if (page !== lastSuccessfulPageRef.current) {
          dispatch({ type: "setPage", page: lastSuccessfulPageRef.current });
        }
      }
    }).finally(() => {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    });
  }, [
    api,
    filters,
    page,
    pageSize,
    project.id,
  ]);

  useEffect(() => api.onExportProgress(setExportProgress), [api]);

  useEffect(() => api.onAppCloseRequested(() => {
    if (closingRef.current) {
      return;
    }
    if (exportingRef.current) {
      setError("正在导出，请等待导出完成后再关闭应用");
      return;
    }
    closingRef.current = true;
    void (async () => {
      try {
        await editorRef.current?.flushUntilSaved();
        await api.confirmAppClose();
      } catch (closeError) {
        closingRef.current = false;
        setError(errorMessage(closeError));
      }
    })();
  }), [api]);

  const selectedRow = useMemo(() => result.rows.find(
    ({ rowId }) => rowId === selectedRowId,
  ) ?? null, [result.rows, selectedRowId]);
  const selectedRowIndex = useMemo(
    () => result.rows.findIndex(({ rowId }) => rowId === selectedRowId),
    [result.rows, selectedRowId],
  );
  const pageTransitioning = loading || page !== result.page;
  const canPrevious = !pageTransitioning
    && selectedRowIndex >= 0
    && (selectedRowIndex > 0 || result.page > 1);
  const canNext = !pageTransitioning
    && selectedRowIndex >= 0
    && (selectedRowIndex < result.rows.length - 1 || result.page < result.pageCount);

  const loadHistory = useCallback(async (rowId: string) => {
    const historyRequestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const nextHistory = await api.getTranslationHistory(project.id, rowId);
      if (
        historyRequestId === historyRequestIdRef.current
        && selectedRowIdRef.current === rowId
      ) {
        setHistory(nextHistory);
      }
    } catch (historyError) {
      if (
        historyRequestId === historyRequestIdRef.current
        && selectedRowIdRef.current === rowId
      ) {
        setHistoryError(errorMessage(historyError));
      }
    } finally {
      if (
        historyRequestId === historyRequestIdRef.current
        && selectedRowIdRef.current === rowId
      ) {
        setHistoryLoading(false);
      }
    }
  }, [api, project.id]);

  useEffect(() => {
    selectedRowIdRef.current = selectedRowId;
    if (!selectedRowId) {
      ++historyRequestIdRef.current;
      setHistory([]);
      setHistoryError("");
      setHistoryLoading(false);
      return;
    }
    setHistory([]);
    void loadHistory(selectedRowId);
  }, [loadHistory, selectedRowId]);

  const commitAction = async (action: WorkspaceAction) => {
    try {
      await editorRef.current?.flushUntilSaved();
      pendingPageSelectionRef.current = null;
      dispatch(action);
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  };

  const saveTranslation = useCallback(async (rowId: string, update: TranslationTextUpdate) => {
    const updated = await api.updateTranslation(project.id, rowId, update);
    if (selectedRowIdRef.current === rowId) {
      await loadHistory(rowId);
    }
    return updated;
  }, [api, loadHistory, project.id]);

  const applySavedRow = useCallback((updated: TranslationUnitRow) => {
    setResult((current) => ({
      ...current,
      rows: current.rows.map((row) => row.rowId === updated.rowId ? updated : row),
    }));
  }, []);

  const selectRow = async (row: TranslationUnitRow) => {
    if (row.rowId === selectedRowId) {
      return;
    }
    try {
      await editorRef.current?.flushUntilSaved();
      setSelectedRowId(row.rowId);
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  };

  const navigateEditor = (direction: "previous" | "next") => {
    if (pageTransitioning || selectedRowIndex < 0) {
      return;
    }

    const adjacentIndex = direction === "previous"
      ? selectedRowIndex - 1
      : selectedRowIndex + 1;
    const adjacentRow = result.rows[adjacentIndex];
    if (adjacentRow) {
      setSelectedRowId(adjacentRow.rowId);
      return;
    }

    const nextPage = direction === "previous" ? result.page - 1 : result.page + 1;
    if (nextPage < 1 || nextPage > result.pageCount) {
      return;
    }
    pendingPageSelectionRef.current = {
      page: nextPage,
      edge: direction === "previous" ? "last" : "first",
    };
    dispatch({ type: "setPage", page: nextPage });
  };

  const restoreHistory = useCallback(async (entry: TranslationHistoryEntry) => {
    await editorRef.current?.flushUntilSaved();
    const updated = await api.updateTranslation(
      project.id,
      entry.rowId,
      { sourceText: entry.sourceText, targetText: entry.targetText },
    );
    applySavedRow(updated);
    if (selectedRowIdRef.current === entry.rowId) {
      setEditorNonce((current) => current + 1);
      await loadHistory(entry.rowId);
    }
  }, [api, applySavedRow, loadHistory, project.id]);

  const exportProject = async (scope: "all" | "filtered") => {
    exportingRef.current = true;
    setExporting(true);
    setExportedPath("");
    setError("");
    try {
      await editorRef.current?.flushUntilSaved();
      const filePath = await api.exportProject(
        project.id,
        scope === "filtered" ? filters : undefined,
      );
      if (filePath) {
        setExportedPath(filePath);
      }
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const openExportDirectory = async () => {
    if (!exportedPath) {
      return;
    }
    try {
      await api.openExportDirectory(exportedPath);
    } catch (openError) {
      setError(errorMessage(openError));
    }
  };

  const leaveWorkspace = async () => {
    try {
      await editorRef.current?.flushUntilSaved();
      onBack();
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  };

  const resetKey = `${filters.query}|${filters.targetLanguage}|${filters.status}|${filters.duplicateOnly}|${page}|${pageSize}`;

  return (
    <main className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <button
          aria-label="返回项目库"
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => void leaveWorkspace()}
          title="返回项目库"
          type="button"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="inline-flex size-9 items-center justify-center rounded bg-blue-700 text-white">
          <Languages size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-950">{project.name}</h1>
          <p className="truncate text-xs text-slate-500">{project.fileName}</p>
        </div>
        <div className="hidden items-center gap-4 text-xs text-slate-500 xl:flex">
          <span>翻译行 <strong className="ml-1 text-slate-800">{project.totalUnits.toLocaleString()}</strong></span>
          <span>已修改 <strong className="ml-1 text-amber-700">{project.changedUnits.toLocaleString()}</strong></span>
          <span>空译文 <strong className="ml-1 text-red-700">{project.emptyUnits.toLocaleString()}</strong></span>
        </div>
        <button
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exporting}
          onClick={() => void exportProject("filtered")}
          type="button"
        >
          <Download size={16} />
          导出筛选
        </button>
        <button
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-blue-700 px-3 text-sm font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exporting}
          onClick={() => void exportProject("all")}
          type="button"
        >
          {exporting ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
          导出全部
        </button>
      </header>

      <div className="h-1 shrink-0 bg-slate-200">
        {exportProgress && exporting ? (
          <div
            aria-label="导出进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={exportProgress.percent}
            className="h-full bg-blue-600 transition-[width]"
            role="progressbar"
            style={{ width: `${exportProgress.percent}%` }}
          />
        ) : null}
      </div>

      {error ? (
        <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-red-200 bg-red-50 px-4 text-sm text-red-800" role="alert">
          <span className="truncate">{error}</span>
          <button className="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-red-500" onClick={() => setError("")} type="button">关闭</button>
        </div>
      ) : null}

      {exportedPath ? (
        <div
          aria-label="导出成功"
          className="flex min-h-11 shrink-0 items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 text-sm text-emerald-900"
          role="status"
        >
          <CheckCircle2 className="shrink-0 text-emerald-700" size={17} />
          <span className="shrink-0 font-medium">导出成功</span>
          <span className="min-w-0 flex-1 break-all text-xs text-emerald-800">
            {exportedPath}
          </span>
          <button
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            onClick={() => void openExportDirectory()}
            type="button"
          >
            <FolderOpen size={14} />
            打开文件夹
          </button>
        </div>
      ) : null}

      <section className="grid shrink-0 grid-cols-[minmax(260px,1fr)_104px_168px_270px_128px] gap-2 border-b border-slate-200 bg-white p-2">
        <label className="relative">
          <span className="sr-only">搜索翻译</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            aria-label="搜索翻译"
            className="h-10 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            onChange={(event) => dispatch({ type: "setDraftQuery", query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void commitAction({ type: "submitSearch" });
              }
            }}
            placeholder="输入文字，按回车或点击搜索"
            role="searchbox"
            value={workspace.draftQuery}
          />
        </label>
        <button
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded bg-blue-700 px-3 text-sm font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => void commitAction({ type: "submitSearch" })}
          type="button"
        >
          <Search size={15} />
          搜索
        </button>
        <label>
          <span className="sr-only">目标语言</span>
          <select
            aria-label="目标语言"
            className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            onChange={(event) => void commitAction({
              type: "setTargetLanguage",
              targetLanguage: event.target.value,
            })}
            value={filters.targetLanguage}
          >
            <option value="">全部目标语言</option>
            {project.targetLanguages.map((language) => (
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
        </label>
        <div className="grid h-10 grid-cols-3 rounded border border-slate-300 bg-slate-50 p-0.5" role="group" aria-label="翻译状态">
          <StatusButton active={filters.status === "all"} label="全部" onClick={() => void commitAction({ type: "setStatus", status: "all" })} />
          <StatusButton active={filters.status === "changed"} label="已修改" onClick={() => void commitAction({ type: "setStatus", status: "changed" })} />
          <StatusButton active={filters.status === "empty"} label="只看空译文" onClick={() => void commitAction({ type: "setStatus", status: "empty" })} />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded border border-slate-300 px-3 text-sm text-slate-700">
          <input
            checked={filters.duplicateOnly}
            className="size-4 accent-blue-700"
            onChange={(event) => void commitAction({
              type: "setDuplicateOnly",
              duplicateOnly: event.target.checked,
            })}
            type="checkbox"
          />
          仅重复项
        </label>
      </section>

      <section className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
            <span>{result.total.toLocaleString()} 条结果</span>
            <button
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded px-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => void commitAction({ type: "clearFilters" })}
              type="button"
            >
              <FilterX size={14} />
              清除筛选
            </button>
          </div>
          <TranslationTable
            loading={loading}
            onSelect={(row) => void selectRow(row)}
            resetKey={resetKey}
            rows={result.rows}
            selectedRowId={selectedRowId}
          />
          <Pagination
            onPageChange={(nextPage) => void commitAction({ type: "setPage", page: nextPage })}
            onPageSizeChange={(nextSize) => void commitAction({ type: "setPageSize", pageSize: nextSize })}
            page={result.page}
            pageCount={result.pageCount}
            pageSize={workspace.pageSize}
            total={result.total}
          />
        </div>

        {selectedRow ? (
          <TranslationEditor
            canNext={canNext}
            canPrevious={canPrevious}
            editingLocked={exporting || pageTransitioning}
            history={history}
            historyError={historyError}
            historyLoading={historyLoading}
            key={`${selectedRow.rowId}:${editorNonce}`}
            onNext={() => navigateEditor("next")}
            onCopyText={api.copyText}
            onPrevious={() => navigateEditor("previous")}
            onRestoreHistory={restoreHistory}
            onSave={saveTranslation}
            onSaved={applySavedRow}
            ref={editorRef}
            row={selectedRow}
          />
        ) : (
          <aside className="flex w-[420px] shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
            选择一条翻译开始编辑
          </aside>
        )}
      </section>
    </main>
  );
}

function StatusButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active
        ? "cursor-pointer rounded bg-white text-xs font-medium text-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        : "cursor-pointer rounded text-xs font-medium text-slate-600 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500"}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
