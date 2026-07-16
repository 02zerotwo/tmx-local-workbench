"use client";

import {
  CirclePause,
  CirclePlay,
  ClipboardList,
  Loader2,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuditTaskConfigDialog } from "@/components/ai/audit-task-config-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  AiAuditBoundaries,
  AiAuditJobRecord,
  ProjectFilters,
  TmxDesktopApi,
} from "@/lib/desktop-types";

type TaskListApi = Pick<
  TmxDesktopApi,
  | "queryProject"
  | "listAiAuditJobs"
  | "startAiAudit"
  | "pauseAiAudit"
  | "resumeAiAudit"
  | "onAiAuditEvent"
  | "getAiAuditDefaults"
  | "saveAiAuditDefaults"
>;

type AuditTaskListProps = {
  api: TaskListApi;
  projectId: string;
  targetLanguages: string[];
  onOpenJob: (job: AiAuditJobRecord) => void;
};

const STATUS_META: Record<
  AiAuditJobRecord["status"],
  { label: string; className: string }
> = {
  draft: { label: "草稿", className: "bg-muted text-muted-foreground" },
  queued: { label: "排队中", className: "bg-slate-100 text-slate-600" },
  running: { label: "审查中", className: "bg-blue-50 text-blue-700" },
  paused: { label: "已暂停", className: "bg-amber-50 text-amber-700" },
  stopped: { label: "已停止", className: "bg-muted text-muted-foreground" },
  complete: { label: "已完成", className: "bg-emerald-50 text-emerald-700" },
  partial_failure: { label: "部分完成", className: "bg-amber-50 text-amber-700" },
  applied: { label: "已入库", className: "bg-emerald-50 text-emerald-700" },
};

const STATUS_LABEL: Record<ProjectFilters["status"], string> = {
  all: "全部状态",
  changed: "仅已修改",
  empty: "仅空译文",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 审查操作失败";
}

function scopeSummary(filters: ProjectFilters): string {
  const parts = [
    filters.targetLanguage || "全部语言",
    STATUS_LABEL[filters.status],
  ];
  if (filters.duplicateOnly) parts.push("仅重复项");
  if (filters.query) parts.push(`“${filters.query}”`);
  return parts.join(" · ");
}

function isReviewable(status: AiAuditJobRecord["status"]): boolean {
  return status === "complete" || status === "partial_failure" || status === "applied";
}

export function AuditTaskList({
  api,
  projectId,
  targetLanguages,
  onOpenJob,
}: AuditTaskListProps) {
  const [jobs, setJobs] = useState<AiAuditJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setJobs(await api.listAiAuditJobs(projectId));
  }, [api, projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadJobs()
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadJobs]);

  useEffect(() => api.onAiAuditEvent(({ event }) => {
    if (event.type !== "status" && event.type !== "progress") return;
    setJobs((current) => {
      const exists = current.some((job) => job.id === event.job.id);
      return exists
        ? current.map((job) => (job.id === event.job.id ? event.job : job))
        : [event.job, ...current];
    });
  }), [api]);

  const startAudit = async (
    filters: ProjectFilters,
    boundaries: AiAuditBoundaries,
  ) => {
    const created = await api.startAiAudit(projectId, filters, boundaries);
    setJobs((current) => [created, ...current.filter((job) => job.id !== created.id)]);
    setConfigOpen(false);
  };

  const pauseOrResume = async (job: AiAuditJobRecord) => {
    setBusyJobId(job.id);
    setError("");
    try {
      const updated = job.status === "paused"
        ? await api.resumeAiAudit(job.id)
        : await api.pauseAiAudit(job.id);
      setJobs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-medium text-slate-700">
          审查任务 ({jobs.length})
        </span>
        <Button
          className="ml-auto h-8 gap-1.5"
          onClick={() => setConfigOpen(true)}
          size="sm"
          type="button"
        >
          <Plus size={14} />
          新建任务
        </Button>
      </div>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            正在加载任务
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ClipboardList className="text-slate-300" size={28} />
            还没有审查任务，点击右上角「新建任务」开始。
          </div>
        ) : (
          jobs.map((job) => {
            const meta = STATUS_META[job.status];
            const progress = job.totalItems > 0
              ? Math.round((job.completedItems / job.totalItems) * 100)
              : 0;
            const reviewable = isReviewable(job.status);
            const active = job.status === "running" || job.status === "paused";
            return (
              <div
                className="rounded-md border border-slate-200 bg-white p-3"
                key={job.id}
              >
                <div className="flex items-center gap-2">
                  <Badge className={meta.className} variant="secondary">
                    {meta.label}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                    {scopeSummary(job.filters)}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {progress}%
                  </span>
                </div>
                <Progress className="mt-2" value={progress} />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="tabular-nums">
                    {job.completedItems.toLocaleString()} / {job.totalItems.toLocaleString()} 条
                  </span>
                  <span className="tabular-nums">
                    发现 {job.findingItems.toLocaleString()}
                    {job.failedItems > 0 ? ` · 失败 ${job.failedItems.toLocaleString()}` : ""}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {active ? (
                    <Button
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={busyJobId === job.id}
                      onClick={() => void pauseOrResume(job)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {busyJobId === job.id ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : job.status === "paused" ? (
                        <CirclePlay size={13} />
                      ) : (
                        <CirclePause size={13} />
                      )}
                      {job.status === "paused" ? "继续" : "暂停"}
                    </Button>
                  ) : null}
                  {reviewable ? (
                    <Button
                      className="ml-auto h-7 gap-1 px-2.5 text-xs"
                      onClick={() => onOpenJob(job)}
                      size="sm"
                      type="button"
                    >
                      进入审阅 ({job.findingItems.toLocaleString()})
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AuditTaskConfigDialog
        api={api}
        onOpenChange={setConfigOpen}
        onStart={startAudit}
        open={configOpen}
        projectId={projectId}
        targetLanguages={targetLanguages}
      />
    </div>
  );
}
