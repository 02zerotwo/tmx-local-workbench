"use client";

import {
  Check,
  CheckCheck,
  CirclePause,
  CirclePlay,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiAuditFindingRecord,
  AiAuditJobRecord,
  ProjectFilters,
  TmxDesktopApi,
} from "@/lib/desktop-types";

const AUDIT_CATEGORIES = [
  ["accuracy", "准确性"],
  ["fluency", "流畅度"],
  ["terminology", "术语"],
  ["consistency", "一致性"],
  ["punctuation", "标点"],
  ["formatting", "格式与占位符"],
] as const;

type SetupApi = Pick<TmxDesktopApi,
  "listAiAuditJobs" | "startAiAudit" | "pauseAiAudit" | "resumeAiAudit" | "onAiAuditEvent"
>;

type ReviewApi = Pick<TmxDesktopApi,
  "listAiAuditJobs" | "listAiAuditFindings" | "decideAiAuditFinding" | "acceptAllAiAuditFindings" | "applyAiAudit"
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 审查操作失败";
}

function statusText(status: AiAuditJobRecord["status"]): string {
  return ({
    draft: "草稿",
    queued: "排队中",
    running: "审查中",
    paused: "已暂停",
    stopped: "已停止",
    complete: "已完成",
    partial_failure: "部分完成",
    applied: "已入库",
  } as const)[status];
}

export function AuditSetupPanel({
  api,
  projectId,
  filters,
  resultCount,
  onReviewReady,
}: {
  api: SetupApi;
  projectId: string;
  filters: ProjectFilters;
  resultCount: number;
  onReviewReady: (job: AiAuditJobRecord) => void;
}) {
  const [categories, setCategories] = useState<string[]>(
    AUDIT_CATEGORIES.map(([value]) => value),
  );
  const [minConfidence, setMinConfidence] = useState("0.8");
  const [allowRewrite, setAllowRewrite] = useState(true);
  const [job, setJob] = useState<AiAuditJobRecord | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listAiAuditJobs(projectId).then((jobs) => {
      if (active) {
        jobIdRef.current = jobs[0]?.id ?? null;
        setJob(jobs[0] ?? null);
      }
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError));
    });
    return () => { active = false; };
  }, [api, projectId]);

  useEffect(() => api.onAiAuditEvent(({ jobId, event }) => {
    if (jobIdRef.current && jobId !== jobIdRef.current) return;
    if (event.type === "status" || event.type === "progress") {
      jobIdRef.current = event.job.id;
      setJob(event.job);
      if (event.job.status === "complete" || event.job.status === "partial_failure") {
        onReviewReady(event.job);
      }
    }
  }), [api, onReviewReady]);

  const toggleCategory = (category: string, checked: boolean) => {
    setCategories((current) => checked
      ? [...new Set([...current, category])]
      : current.filter((value) => value !== category));
  };

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await api.startAiAudit(projectId, filters, {
        categories,
        minConfidence: Number(minConfidence),
        allowRewrite,
      });
      jobIdRef.current = created.id;
      setJob(created);
      setConfirming(false);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  const pauseOrResume = async () => {
    if (!job) return;
    setBusy(true);
    try {
      setJob(job.status === "paused"
        ? await api.resumeAiAudit(job.id)
        : await api.pauseAiAudit(job.id));
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(false);
    }
  };

  const progress = job && job.totalItems > 0
    ? Math.round((job.completedItems / job.totalItems) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        <section>
          <h3 className="text-sm font-semibold text-slate-900">检查范围</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <ScopeStat label="当前筛选" value={`${resultCount.toLocaleString()} 条`} />
            <ScopeStat label="目标语言" value={filters.targetLanguage || "全部"} />
            <ScopeStat label="搜索文字" value={filters.query || "无"} />
            <ScopeStat label="记录状态" value={filters.status === "all" ? "全部" : filters.status === "changed" ? "已修改" : "空译文"} />
          </div>
        </section>

        <section className="border-t border-slate-200 pt-3">
          <h3 className="text-sm font-semibold text-slate-900">审查类别</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {AUDIT_CATEGORIES.map(([value, label]) => (
              <label className="flex items-center gap-2 text-xs text-slate-700" key={value}>
                <Checkbox
                  checked={categories.includes(value)}
                  onCheckedChange={(checked) => toggleCategory(value, checked === true)}
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
          <label className="space-y-1.5 text-xs font-medium text-slate-700">
            最低置信度
            <Select onValueChange={setMinConfidence} value={minConfidence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.7">70%</SelectItem>
                <SelectItem value="0.8">80%</SelectItem>
                <SelectItem value="0.9">90%</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
            <Checkbox checked={allowRewrite} onCheckedChange={(checked) => setAllowRewrite(checked === true)} />
            生成纠正译文
          </label>
        </section>

        {job ? (
          <section className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">最近任务</span>
              <Badge variant="secondary">{statusText(job.status)}</Badge>
              <span className="ml-auto text-xs text-slate-500">{progress}%</span>
            </div>
            <Progress value={progress} />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{job.completedItems.toLocaleString()} / {job.totalItems.toLocaleString()} 条</span>
              <span>{job.findingItems.toLocaleString()} 条有问题，{job.failedItems.toLocaleString()} 条失败</span>
            </div>
            {job.status === "running" || job.status === "paused" ? (
              <Button className="w-full" disabled={busy} onClick={() => void pauseOrResume()} variant="outline">
                {job.status === "paused" ? <CirclePlay /> : <CirclePause />}
                {job.status === "paused" ? "继续审查" : "暂停审查"}
              </Button>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
        <Button
          className="w-full"
          disabled={busy || categories.length === 0 || resultCount === 0 || job?.status === "running"}
          onClick={() => setConfirming(true)}
        >
          <ShieldCheck />
          确认范围并开始审查
        </Button>
      </div>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认开始 AI 审查</AlertDialogTitle>
            <AlertDialogDescription>
              将冻结当前 {resultCount.toLocaleString()} 条筛选结果并逐条检查。AI 只暂存建议，完成后仍需你最终确认才会写入数据库。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              开始审查
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AuditReviewPanel({
  api,
  projectId,
  onApplied,
}: {
  api: ReviewApi;
  projectId: string;
  onApplied: () => void;
}) {
  const [job, setJob] = useState<AiAuditJobRecord | null>(null);
  const [findings, setFindings] = useState<AiAuditFindingRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadFindings = useCallback(async (jobId: string) => {
    const next = await api.listAiAuditFindings(jobId);
    setFindings(next);
    setDrafts(Object.fromEntries(next.map((finding) => [
      finding.id,
      finding.editedTargetText ?? finding.suggestedTargetText ?? finding.targetText,
    ])));
  }, [api]);

  useEffect(() => {
    let active = true;
    api.listAiAuditJobs(projectId).then(async (jobs) => {
      const latest = jobs.find(({ status }) => (
        status === "complete" || status === "partial_failure" || status === "applied"
      )) ?? null;
      if (!active) return;
      setJob(latest);
      if (latest) await loadFindings(latest.id);
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError));
    });
    return () => { active = false; };
  }, [api, loadFindings, projectId]);

  const decide = async (
    finding: AiAuditFindingRecord,
    decision: AiAuditFindingRecord["decision"],
    editedTargetText?: string,
  ) => {
    setBusy(true);
    try {
      if (editedTargetText === undefined) {
        await api.decideAiAuditFinding(finding.id, decision);
      } else {
        await api.decideAiAuditFinding(finding.id, decision, editedTargetText);
      }
      await loadFindings(finding.jobId);
    } catch (decisionError) {
      setError(errorMessage(decisionError));
    } finally {
      setBusy(false);
    }
  };

  const acceptedCount = findings.filter(({ decision }) => (
    decision === "accepted" || decision === "edited"
  )).length;

  const acceptAll = async () => {
    setBusy(true);
    try {
      if (!job) return;
      await api.acceptAllAiAuditFindings(job.id);
      await loadFindings(job.id);
    } catch (acceptError) {
      setError(errorMessage(acceptError));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.applyAiAudit(job.id);
      setSuccess(`已写入 ${result.applied} 条${result.stale ? `，跳过 ${result.stale} 条已变化内容` : ""}`);
      setConfirming(false);
      onApplied();
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setBusy(false);
    }
  };

  if (!job) {
    return <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-slate-500">完成一项审查后，建议会集中显示在这里。</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-medium text-slate-700">{findings.length} 条建议</span>
        <Button className="ml-auto" disabled={busy} onClick={() => void acceptAll()} size="sm" variant="outline">
          <CheckCheck />全部接受可修改项
        </Button>
        <Button disabled={busy || acceptedCount === 0 || job.status === "applied"} onClick={() => setConfirming(true)} size="sm">
          确认应用 {acceptedCount} 条
        </Button>
      </div>
      {success ? <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div> : null}
      {error ? <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div> : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {findings.map((finding) => (
          <article className="rounded-md border border-slate-200 bg-white p-3" key={finding.id}>
            <div className="flex items-center gap-2">
              <Badge variant={finding.severity === "error" ? "destructive" : "secondary"}>{finding.category}</Badge>
              <span className="text-xs font-semibold text-slate-900">{finding.summary}</span>
              <span className="ml-auto text-[11px] text-slate-400">{Math.round(finding.confidence * 100)}%</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{finding.evidence}</p>
            <div className="mt-2 grid gap-2 text-xs">
              <TextBlock label="源文" text={finding.sourceText} />
              <TextBlock label="当前译文" text={finding.targetText} />
              {finding.suggestedTargetText ? (
                <label className="space-y-1 text-[11px] font-medium text-slate-500">
                  建议译文
                  <Textarea
                    className="min-h-16 bg-emerald-50/40 text-xs leading-5 text-slate-900"
                    onChange={(event) => setDrafts((current) => ({ ...current, [finding.id]: event.target.value }))}
                    value={drafts[finding.id] ?? ""}
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Button aria-label="接受建议" disabled={busy || !finding.suggestedTargetText} onClick={() => void decide(finding, "accepted")} size="sm" variant="outline">
                <Check />接受
              </Button>
              <Button disabled={busy || !finding.suggestedTargetText} onClick={() => void decide(finding, "edited", drafts[finding.id])} size="sm" variant="outline">
                保存修改
              </Button>
              <Button aria-label="拒绝建议" disabled={busy} onClick={() => void decide(finding, "rejected")} size="sm" variant="ghost">
                <X />拒绝
              </Button>
              {finding.decision !== "pending" ? <Badge className="ml-auto" variant="outline">{finding.decision}</Badge> : null}
            </div>
          </article>
        ))}
      </div>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认写入翻译数据库</AlertDialogTitle>
            <AlertDialogDescription>
              将一次性应用 {acceptedCount} 条已接受建议，并为每条译文保留完整修改历史。审查后发生变化的内容会自动跳过。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回检查</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void apply()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              确认写入数据库
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScopeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-medium text-slate-800" title={value}>{value}</div>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2.5 py-2">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-1 whitespace-pre-wrap leading-5 text-slate-800">{text}</div>
    </div>
  );
}
