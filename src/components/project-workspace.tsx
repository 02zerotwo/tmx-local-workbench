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
  X,
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
import { AiModePanel } from "./ai/ai-mode-panel";
import { WorkspaceDetailPanel } from "./workspace-detail-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

export function ProjectWorkspace({
  api,
  project,
  onBack,
}: ProjectWorkspaceProps) {
  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, () =>
    createWorkspaceState(),
  );
  const [result, setResult] = useState<ProjectQueryResult>(EMPTY_RESULT);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [exportedPath, setExportedPath] = useState("");
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editorNonce, setEditorNonce] = useState(0);
  const [error, setError] = useState("");
  const [dataRefreshNonce, setDataRefreshNonce] = useState(0);
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

  const { filters, page, pageSize } = workspace;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    api
      .queryProject({
        projectId: project.id,
        filters,
        page,
        pageSize,
      })
      .then((nextResult) => {
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
                ? (nextResult.rows.at(-1)?.rowId ?? "")
                : (nextResult.rows[0]?.rowId ?? "");
            }
            return nextResult.rows.some(({ rowId }) => rowId === current)
              ? current
              : (nextResult.rows[0]?.rowId ?? "");
          });
        });
        setError("");
      })
      .catch((queryError: unknown) => {
        if (requestId === requestIdRef.current) {
          pendingPageSelectionRef.current = null;
          setError(errorMessage(queryError));
          if (page !== lastSuccessfulPageRef.current) {
            dispatch({ type: "setPage", page: lastSuccessfulPageRef.current });
          }
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [api, filters, page, pageSize, project.id, dataRefreshNonce]);

  useEffect(() => api.onExportProgress(setExportProgress), [api]);

  useEffect(
    () =>
      api.onAppCloseRequested(() => {
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
      }),
    [api],
  );

  const selectedRow = useMemo(
    () => result.rows.find(({ rowId }) => rowId === selectedRowId) ?? null,
    [result.rows, selectedRowId],
  );
  const selectedRowIndex = useMemo(
    () => result.rows.findIndex(({ rowId }) => rowId === selectedRowId),
    [result.rows, selectedRowId],
  );
  const pageTransitioning = loading || page !== result.page;
  const canPrevious =
    !pageTransitioning &&
    selectedRowIndex >= 0 &&
    (selectedRowIndex > 0 || result.page > 1);
  const canNext =
    !pageTransitioning &&
    selectedRowIndex >= 0 &&
    (selectedRowIndex < result.rows.length - 1 ||
      result.page < result.pageCount);

  const loadHistory = useCallback(
    async (rowId: string) => {
      const historyRequestId = ++historyRequestIdRef.current;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const nextHistory = await api.getTranslationHistory(project.id, rowId);
        if (
          historyRequestId === historyRequestIdRef.current &&
          selectedRowIdRef.current === rowId
        ) {
          setHistory(nextHistory);
        }
      } catch (historyError) {
        if (
          historyRequestId === historyRequestIdRef.current &&
          selectedRowIdRef.current === rowId
        ) {
          setHistoryError(errorMessage(historyError));
        }
      } finally {
        if (
          historyRequestId === historyRequestIdRef.current &&
          selectedRowIdRef.current === rowId
        ) {
          setHistoryLoading(false);
        }
      }
    },
    [api, project.id],
  );

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

  const saveTranslation = useCallback(
    async (rowId: string, update: TranslationTextUpdate) => {
      const updated = await api.updateTranslation(project.id, rowId, update);
      if (selectedRowIdRef.current === rowId) {
        await loadHistory(rowId);
      }
      return updated;
    },
    [api, loadHistory, project.id],
  );

  const applySavedRow = useCallback((updated: TranslationUnitRow) => {
    setResult((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.rowId === updated.rowId ? updated : row,
      ),
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

    const adjacentIndex =
      direction === "previous" ? selectedRowIndex - 1 : selectedRowIndex + 1;
    const adjacentRow = result.rows[adjacentIndex];
    if (adjacentRow) {
      setSelectedRowId(adjacentRow.rowId);
      return;
    }

    const nextPage =
      direction === "previous" ? result.page - 1 : result.page + 1;
    if (nextPage < 1 || nextPage > result.pageCount) {
      return;
    }
    pendingPageSelectionRef.current = {
      page: nextPage,
      edge: direction === "previous" ? "last" : "first",
    };
    dispatch({ type: "setPage", page: nextPage });
  };

  const restoreHistory = useCallback(
    async (entry: TranslationHistoryEntry) => {
      await editorRef.current?.flushUntilSaved();
      const updated = await api.updateTranslation(project.id, entry.rowId, {
        sourceText: entry.sourceText,
        targetText: entry.targetText,
      });
      applySavedRow(updated);
      if (selectedRowIdRef.current === entry.rowId) {
        setEditorNonce((current) => current + 1);
        await loadHistory(entry.rowId);
      }
    },
    [api, applySavedRow, loadHistory, project.id],
  );

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
        <Button
          aria-label="返回项目库"
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => void leaveWorkspace()}
          title="返回项目库"
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeft size={18} />
        </Button>
        <span className="inline-flex size-9 items-center justify-center rounded bg-blue-700 text-white">
          <Languages size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-950">
            {project.name}
          </h1>
          <p className="truncate text-xs text-slate-500">{project.fileName}</p>
        </div>
        <div className="hidden items-center gap-4 text-xs text-slate-500 xl:flex">
          <span>
            翻译行{" "}
            <strong className="ml-1 text-slate-800">
              {project.totalUnits.toLocaleString()}
            </strong>
          </span>
          <span>
            已修改{" "}
            <strong className="ml-1 text-amber-700">
              {project.changedUnits.toLocaleString()}
            </strong>
          </span>
          <span>
            空译文{" "}
            <strong className="ml-1 text-red-700">
              {project.emptyUnits.toLocaleString()}
            </strong>
          </span>
        </div>
        <Button
          className="h-9 text-slate-700"
          disabled={exporting}
          onClick={() => void exportProject("filtered")}
          type="button"
          variant="ghost"
        >
          <Download size={16} />
          导出筛选
        </Button>
        <Button
          className="h-9 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          disabled={exporting}
          onClick={() => void exportProject("all")}
          type="button"
          variant="ghost"
        >
          {exporting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <FileSpreadsheet size={16} />
          )}
          导出全部
        </Button>
      </header>

      <div className="h-1 shrink-0 bg-slate-200">
        {exportProgress && exporting ? (
          <Progress
            aria-label="导出进度"
            className="h-1 rounded-none"
            value={exportProgress.percent}
          />
        ) : null}
      </div>

      {error ? (
        <div
          className="flex min-h-10 shrink-0 items-center justify-between border-b border-red-200 bg-red-50 px-4 text-sm text-red-800"
          role="alert"
        >
          <span className="truncate">{error}</span>
          <Button
            onClick={() => setError("")}
            size="sm"
            type="button"
            variant="ghost"
          >
            关闭
          </Button>
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
          <Button
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900"
            onClick={() => void openExportDirectory()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <FolderOpen size={14} />
            打开文件夹
          </Button>
        </div>
      ) : null}

      <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2.5">
        <InputGroup className="h-9 min-w-56 flex-1 bg-background sm:max-w-sm">
          <InputGroupAddon>
            <Search size={16} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="搜索翻译"
            onChange={(event) =>
              dispatch({ type: "setDraftQuery", query: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void commitAction({ type: "submitSearch" });
              }
            }}
            placeholder="输入文字，按回车或点击搜索"
            role="searchbox"
            value={workspace.draftQuery}
          />
          {workspace.draftQuery ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="清空搜索"
                onClick={() => {
                  dispatch({ type: "setDraftQuery", query: "" });
                  void commitAction({ type: "submitSearch" });
                }}
                size="icon-sm"
              >
                <X size={14} />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <Button
          className="h-9 shrink-0 gap-1.5"
          onClick={() => void commitAction({ type: "submitSearch" })}
          type="button"
        >
          <Search size={15} />
          搜索
        </Button>
        <Separator className="hidden h-6 sm:block" orientation="vertical" />
        <Select
          onValueChange={(value) =>
            void commitAction({
              type: "setTargetLanguage",
              targetLanguage: value === "__all__" ? "" : value,
            })
          }
          value={filters.targetLanguage || "__all__"}
        >
          <SelectTrigger
            aria-label="目标语言"
            className="!h-10 w-40 shrink-0 bg-background"
          >
            <SelectValue className="!h-10" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="__all__">全部目标语言</SelectItem>
            {project.targetLanguages.map((language) => (
              <SelectItem key={language} value={language}>
                {language}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          aria-label="翻译状态"
          className="grid h-full shrink-0 grid-cols-3 rounded-lg bg-muted p-1"
          onValueChange={(value) => {
            if (!value) {
              return;
            }
            void commitAction({
              type: "setStatus",
              status: value as typeof filters.status,
            });
          }}
          size="sm"
          type="single"
          value={filters.status}
          variant="default"
        >
          <ToggleGroupItem
            className="grid rounded-md text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-sm"
            value="all"
          >
            全部
          </ToggleGroupItem>
          <ToggleGroupItem
            className="grid rounded-md text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-sm"
            value="changed"
          >
            已修改
          </ToggleGroupItem>
          <ToggleGroupItem
            className="grid rounded-md text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-sm"
            value="empty"
          >
            只看空译文
          </ToggleGroupItem>
        </ToggleGroup>
        <Label className="h-9 shrink-0 cursor-pointer rounded-lg border border-input px-3 text-sm font-normal text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <Checkbox
            checked={filters.duplicateOnly}
            onCheckedChange={(checked) =>
              void commitAction({
                type: "setDuplicateOnly",
                duplicateOnly: checked === true,
              })
            }
          />
          仅重复项
        </Label>
      </section>

      <section className="min-h-0 flex-1">
        <ResizablePanelGroup className="min-h-0" orientation="horizontal">
          <ResizablePanel defaultSize="50" id="translation-list" minSize="35%">
            <div className="flex h-full min-w-0 flex-col">
              <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3 text-xs text-muted-foreground">
                <span>
                  <strong className="font-medium text-foreground">
                    {result.total.toLocaleString()}
                  </strong>{" "}
                  条结果
                </span>
                <Button
                  className="h-7 gap-1.5 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void commitAction({ type: "clearFilters" })}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <FilterX size={14} />
                  清除筛选
                </Button>
              </div>
              <TranslationTable
                loading={loading}
                onSelect={(row) => void selectRow(row)}
                resetKey={resetKey}
                rows={result.rows}
                selectedRowId={selectedRowId}
              />
              <Pagination
                onPageChange={(nextPage) =>
                  void commitAction({ type: "setPage", page: nextPage })
                }
                onPageSizeChange={(nextSize) =>
                  void commitAction({ type: "setPageSize", pageSize: nextSize })
                }
                page={result.page}
                pageCount={result.pageCount}
                pageSize={workspace.pageSize}
                total={result.total}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle aria-label="调整工作区宽度" withHandle />

          <ResizablePanel defaultSize="50" id="detail-workspace" minSize="35%">
            <WorkspaceDetailPanel
              aiPanel={
                <AiModePanel
                  api={api}
                  onApplied={() =>
                    setDataRefreshNonce((current) => current + 1)
                  }
                  projectId={project.id}
                  targetLanguages={project.targetLanguages}
                />
              }
              editor={
                <div className="min-h-0 flex-1 [&>aside]:h-full [&>aside]:border-l-0">
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
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      选择一条翻译开始编辑
                    </div>
                  )}
                </div>
              }
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </section>
    </main>
  );
}
