"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  DatabaseBackup,
  FileArchive,
  FileUp,
  FolderOpen,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ImportProgress,
  ProjectSummary,
  TmxDesktopApi,
} from "@/lib/desktop-types";
import { ConfirmDialog } from "./confirm-dialog";

type ProjectLibraryProps = {
  api: TmxDesktopApi | null;
  onOpenProject: (project: ProjectSummary) => void;
};

type SortKey = "name" | "updatedAt" | "totalUnits";
type BusyAction = "import" | "rename" | "delete" | "backup" | "restore" | null;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

function statusLabel(status: ProjectSummary["importStatus"]): string {
  if (status === "ready") {
    return "可编辑";
  }
  if (status === "importing") {
    return "导入中";
  }
  return "导入失败";
}

export function ProjectLibrary({ api, onOpenProject }: ProjectLibraryProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(api));
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [renameProject, setRenameProject] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteProject, setDeleteProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }

    let active = true;
    api.listProjects()
      .then((result) => {
        if (active) {
          setProjects(result);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    const unsubscribe = api.onImportProgress((nextProgress) => {
      if (active) {
        setProgress(nextProgress);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    if (!api) {
      return;
    }

    return api.onAppCloseRequested(() => {
      void api.confirmAppClose().catch((closeError: unknown) => {
        setError(errorMessage(closeError));
      });
    });
  }, [api]);

  const sortedProjects = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...projects].sort((left, right) => {
      if (sortKey === "name") {
        return left.name.localeCompare(right.name, "zh-CN") * direction;
      }
      if (sortKey === "totalUnits") {
        return (left.totalUnits - right.totalUnits) * direction;
      }
      return left.updatedAt.localeCompare(right.updatedAt) * direction;
    });
  }, [projects, sortDirection, sortKey]);

  const totals = useMemo(() => projects.reduce(
    (result, project) => ({
      units: result.units + project.totalUnits,
      changed: result.changed + project.changedUnits,
      empty: result.empty + project.emptyUnits,
    }),
    { units: 0, changed: 0, empty: 0 },
  ), [projects]);

  const chooseSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" ? "asc" : "desc");
  };

  const refreshProjects = async () => {
    if (!api) {
      return;
    }
    setLoading(true);
    try {
      setProjects(await api.listProjects());
      setError("");
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setLoading(false);
    }
  };

  const importProject = async () => {
    if (!api) {
      return;
    }
    setBusyAction("import");
    setError("");
    setProgress(null);
    try {
      const imported = await api.importProject();
      if (imported) {
        setProjects((current) => [
          imported,
          ...current.filter(({ id }) => id !== imported.id),
        ]);
        onOpenProject(imported);
      }
    } catch (importError) {
      setError(errorMessage(importError));
    } finally {
      setBusyAction(null);
    }
  };

  const saveRename = async () => {
    if (!api || !renameProject) {
      return;
    }
    setBusyAction("rename");
    setError("");
    try {
      const renamed = await api.renameProject(renameProject.id, renameValue);
      setProjects((current) => current.map((project) => (
        project.id === renamed.id ? renamed : project
      )));
      setRenameProject(null);
    } catch (renameError) {
      setError(errorMessage(renameError));
    } finally {
      setBusyAction(null);
    }
  };

  const confirmDelete = async () => {
    if (!api || !deleteProject) {
      return;
    }
    setBusyAction("delete");
    setError("");
    try {
      await api.deleteProject(deleteProject.id);
      setProjects((current) => current.filter(({ id }) => id !== deleteProject.id));
      setDeleteProject(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusyAction(null);
    }
  };

  const runDatabaseAction = async (action: "backup" | "restore") => {
    if (!api) {
      return;
    }
    setBusyAction(action);
    setError("");
    try {
      if (action === "backup") {
        await api.backupDatabase();
      } else if (await api.restoreDatabase()) {
        await refreshProjects();
      }
    } catch (databaseError) {
      setError(errorMessage(databaseError));
    } finally {
      setBusyAction(null);
    }
  };

  if (!api) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <div className="max-w-lg text-center">
          <Languages className="mx-auto text-blue-700" size={36} />
          <h1 className="mt-4 text-xl font-semibold">请使用桌面版打开</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            项目数据库和本地文件功能只在 TMX 本地翻译工作台桌面应用中提供。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-5 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded bg-blue-700 text-white">
            <Languages aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">TMX 本地翻译工作台</h1>
            <p className="truncate text-xs text-slate-500">项目库</p>
          </div>
        </div>

        <Button
          aria-label="打开数据目录"
          className="size-10 text-slate-700"
          onClick={() => void api.openDataDirectory().catch((openError: unknown) => (
            setError(errorMessage(openError))
          ))}
          size="icon"
          title="打开数据目录"
          type="button"
          variant="ghost"
        >
          <FolderOpen size={17} />
        </Button>
        <Button
          className="h-10 text-slate-700"
          disabled={busyAction !== null}
          onClick={() => void runDatabaseAction("backup")}
          type="button"
          variant="ghost"
        >
          <DatabaseBackup size={16} />
          备份
        </Button>
        <Button
          className="h-10 text-slate-700"
          disabled={busyAction !== null}
          onClick={() => void runDatabaseAction("restore")}
          type="button"
          variant="ghost"
        >
          <RotateCcw size={16} />
          恢复
        </Button>
        <Button
          className="h-10 px-4 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          disabled={busyAction !== null}
          onClick={() => void importProject()}
          type="button"
          variant="ghost"
        >
          {busyAction === "import"
            ? <Loader2 className="animate-spin" size={17} />
            : <FileUp size={17} />}
          导入 TMX
        </Button>
      </header>

      <Progress
        aria-hidden={!progress}
        className={progress?.stage === "error"
          ? "h-1 shrink-0 rounded-none bg-slate-200 [&_[data-slot=progress-indicator]]:bg-red-600"
          : "h-1 shrink-0 rounded-none bg-slate-200"}
        value={progress?.percent ?? 0}
      />

      {error ? (
        <div className="flex min-h-10 items-center justify-between border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800" role="alert">
          <span className="truncate">{error}</span>
          <Button
            aria-label="关闭错误提示"
            className="h-7 px-2 font-medium text-red-800 hover:bg-red-100 hover:text-red-950"
            onClick={() => setError("")}
            size="sm"
            type="button"
            variant="ghost"
          >
            关闭
          </Button>
        </div>
      ) : null}

      <section className="grid shrink-0 grid-cols-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <LibraryMetric label="项目" value={projects.length} />
        <LibraryMetric label="翻译行" value={totals.units} />
        <LibraryMetric label="已修改" value={totals.changed} tone="amber" />
        <LibraryMetric label="空译文" value={totals.empty} tone="red" />
      </section>

      <section className="flex min-h-0 flex-1 flex-col bg-white" aria-label="项目列表">
        <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">全部项目</h2>
            <p className="text-xs text-slate-500">每个导入文件对应一个独立项目</p>
          </div>
          <Button
            aria-label="刷新项目列表"
            className="size-9 text-slate-600"
            disabled={loading}
            onClick={() => void refreshProjects()}
            size="icon"
            title="刷新"
            type="button"
            variant="ghost"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={18} />
            正在读取项目数据库
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <FileArchive className="text-slate-400" size={34} />
            <h2 className="mt-4 text-base font-semibold text-slate-900">还没有项目</h2>
            <p className="mt-1 text-sm text-slate-500">导入第一个 TMX 文件后即可开始筛选和编辑。</p>
            <Button
              className="mt-5 h-10 px-4 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              onClick={() => void importProject()}
              type="button"
              variant="ghost"
            >
              <FileUp size={17} />
              导入 TMX
            </Button>
          </div>
        ) : (
          <Table
            aria-label="项目"
            className="min-w-[1040px] table-fixed border-collapse text-left text-sm"
            containerClassName="min-h-0 flex-1 overflow-auto scrollbar-thin"
          >
            <TableHeader className="sticky top-0 z-10 bg-slate-100 text-xs font-medium text-slate-600">
              <TableRow className="h-10 border-slate-200 hover:bg-slate-100">
                <SortableHeader active={sortKey === "name"} direction={sortDirection} label="项目名称" onClick={() => chooseSort("name")} width="w-[22%]" />
                <TableHead className="w-[18%] px-3 font-medium text-slate-600">源文件</TableHead>
                <TableHead className="w-[17%] px-3 font-medium text-slate-600">语言</TableHead>
                <SortableHeader active={sortKey === "totalUnits"} direction={sortDirection} label="翻译行" onClick={() => chooseSort("totalUnits")} width="w-[9%]" />
                <TableHead className="w-[8%] px-3 text-right font-medium text-slate-600">已修改</TableHead>
                <TableHead className="w-[8%] px-3 text-right font-medium text-slate-600">空译文</TableHead>
                <SortableHeader active={sortKey === "updatedAt"} direction={sortDirection} label="最近更新" onClick={() => chooseSort("updatedAt")} width="w-[11%]" />
                <TableHead className="w-[7%] px-3 text-right font-medium text-slate-600">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProjects.map((project) => (
                <TableRow
                  className="h-[68px] border-b border-slate-200 bg-white transition hover:bg-blue-50/40"
                  key={project.id}
                >
                  <TableCell className="px-3">
                      <Button
                        className="block h-auto max-w-full justify-start truncate px-1 py-0 text-left font-medium text-slate-950 hover:bg-blue-50 hover:text-blue-700 disabled:text-slate-500"
                        disabled={project.importStatus !== "ready"}
                        onClick={() => onOpenProject(project)}
                        type="button"
                        variant="ghost"
                      >
                        {project.name}
                      </Button>
                      <Badge className={project.importStatus === "ready"
                        ? "mt-1 bg-emerald-50 text-[11px] text-emerald-700"
                        : project.importStatus === "failed"
                          ? "mt-1 bg-red-50 text-[11px] text-red-700"
                          : "mt-1 bg-blue-50 text-[11px] text-blue-700"}
                        variant="secondary"
                      >
                        {statusLabel(project.importStatus)}
                      </Badge>
                  </TableCell>
                  <TableCell className="truncate px-3 text-slate-600" title={project.fileName}>{project.fileName}</TableCell>
                  <TableCell className="px-3 text-slate-600">
                      <span>{project.sourceLanguage || "未声明"}</span>
                      <ArrowRight className="mx-1 inline text-slate-400" size={13} />
                      <span className="truncate" title={project.targetLanguages.join(", ")}>
                        {project.targetLanguages.join(", ") || "未识别"}
                      </span>
                  </TableCell>
                  <TableCell className="px-3 text-right tabular-nums text-slate-800">{project.totalUnits.toLocaleString()}</TableCell>
                  <TableCell className="px-3 text-right tabular-nums text-amber-700">{project.changedUnits.toLocaleString()}</TableCell>
                  <TableCell className="px-3 text-right tabular-nums text-red-700">{project.emptyUnits.toLocaleString()}</TableCell>
                  <TableCell className="px-3 text-xs leading-5 text-slate-600">{formatDate(project.updatedAt)}</TableCell>
                  <TableCell className="px-3">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={`打开 ${project.name}`}
                          disabled={project.importStatus !== "ready"}
                          onClick={() => onOpenProject(project)}
                        >
                          <ArrowRight size={16} />
                        </IconButton>
                        <IconButton
                          label={`重命名 ${project.name}`}
                          onClick={() => {
                            setRenameProject(project);
                            setRenameValue(project.name);
                          }}
                        >
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton
                          danger
                          label={`删除 ${project.name}`}
                          onClick={() => setDeleteProject(project)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open && busyAction !== "rename") {
            setRenameProject(null);
          }
        }}
        open={Boolean(renameProject)}
      >
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-md bg-white p-0" showCloseButton={busyAction !== "rename"}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveRename();
            }}
          >
            <DialogHeader className="border-b border-slate-200 px-5 py-4">
              <DialogTitle className="text-base font-semibold text-slate-950">重命名项目</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">源文件名称不会改变。</DialogDescription>
            </DialogHeader>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-slate-700" htmlFor="project-name">项目名称</label>
              <Input
                autoFocus
                className="mt-2 h-10"
                id="project-name"
                onChange={(event) => setRenameValue(event.target.value)}
                value={renameValue}
              />
            </div>
            <DialogFooter className="m-0 flex-row justify-end rounded-none bg-white px-5 py-4">
              <Button
                className="h-10 px-4"
                onClick={() => setRenameProject(null)}
                type="button"
                variant="ghost"
              >
                取消
              </Button>
              <Button
                className="h-10 px-4 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                disabled={!renameValue.trim() || busyAction === "rename"}
                type="submit"
                variant="ghost"
              >
                {busyAction === "rename" ? "保存中..." : "保存名称"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        busy={busyAction === "delete"}
        confirmLabel="删除项目"
        description="此操作会删除项目及全部翻译数据，且无法撤销。原始 TMX 文件不会被删除。"
        onCancel={() => setDeleteProject(null)}
        onConfirm={() => void confirmDelete()}
        open={Boolean(deleteProject)}
        title={`删除“${deleteProject?.name ?? ""}”`}
        tone="danger"
      />
    </main>
  );
}

function LibraryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "red";
}) {
  const valueClass = tone === "amber"
    ? "text-amber-700"
    : tone === "red"
      ? "text-red-700"
      : "text-slate-950";

  return (
    <div className="border-r border-slate-200 px-4 last:border-r-0 first:pl-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function SortableHeader({
  active,
  direction,
  label,
  onClick,
  width,
}: {
  active: boolean;
  direction: "asc" | "desc";
  label: string;
  onClick: () => void;
  width: string;
}) {
  return (
    <TableHead className={`${width} px-3 font-medium`}>
      <Button
        className="h-auto p-0 text-slate-600 hover:bg-transparent hover:text-slate-950"
        onClick={onClick}
        type="button"
        variant="ghost"
      >
        {label}
        {active
          ? direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
          : null}
      </Button>
    </TableHead>
  );
}

function IconButton({
  children,
  danger = false,
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={danger
        ? "size-9"
        : "size-9 text-slate-500 hover:bg-slate-100 hover:text-slate-950"}
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant={danger ? "destructive" : "ghost"}
    >
      {children}
    </Button>
  );
}
