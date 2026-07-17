"use client";

import { ArrowLeft, Check, CheckCheck, Loader2, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TranslationDiff } from "@/components/ai/translation-diff";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  AiAuditFindingRecord,
  AiAuditJobRecord,
  TmxDesktopApi,
} from "@/lib/desktop-types";

type ReviewApi = Pick<
  TmxDesktopApi,
  | "listAiAuditFindings"
  | "decideAiAuditFinding"
  | "acceptAllAiAuditFindings"
  | "applyAiAudit"
>;

type AuditReviewDetailProps = {
  api: ReviewApi;
  job: AiAuditJobRecord;
  onBack: () => void;
  onApplied: () => void;
};

const DECISION_LABEL: Record<AiAuditFindingRecord["decision"], string> = {
  pending: "待定",
  accepted: "已接受",
  edited: "已编辑",
  rejected: "已拒绝",
  skipped: "已跳过",
  stale: "已过期",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 审查操作失败";
}

export function AuditReviewDetail({
  api,
  job,
  onBack,
  onApplied,
}: AuditReviewDetailProps) {
  const [findings, setFindings] = useState<AiAuditFindingRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(job.status === "applied");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const readOnly = applied || job.status === "applied";

  const loadFindings = useCallback(async () => {
    const next = await api.listAiAuditFindings(job.id);
    setFindings(next);
    setDrafts(Object.fromEntries(next.map((finding) => [
      finding.id,
      finding.editedTargetText ?? finding.suggestedTargetText ?? finding.targetText,
    ])));
  }, [api, job.id]);

  useEffect(() => {
    let active = true;
    loadFindings().catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError));
    });
    return () => { active = false; };
  }, [loadFindings]);

  const acceptedCount = findings.filter(({ decision }) => (
    decision === "accepted" || decision === "edited"
  )).length;

  const decide = async (
    finding: AiAuditFindingRecord,
    decision: AiAuditFindingRecord["decision"],
    editedTargetText?: string,
  ) => {
    if (readOnly) return;
    setBusy(true);
    setError("");
    try {
      if (editedTargetText === undefined) {
        await api.decideAiAuditFinding(finding.id, decision);
      } else {
        await api.decideAiAuditFinding(finding.id, decision, editedTargetText);
      }
      await loadFindings();
    } catch (decisionError) {
      setError(errorMessage(decisionError));
    } finally {
      setBusy(false);
    }
  };

  const acceptAll = async () => {
    if (readOnly) return;
    setBusy(true);
    setError("");
    try {
      await api.acceptAllAiAuditFindings(job.id);
      await loadFindings();
    } catch (acceptError) {
      setError(errorMessage(acceptError));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (readOnly) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.applyAiAudit(job.id);
      setSuccess(
        `已写入 ${result.applied} 条${result.stale ? `，跳过 ${result.stale} 条已变化内容` : ""}`,
      );
      setConfirming(false);
      setApplied(true);
      setEditing(new Set());
      onApplied();
      await loadFindings();
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setBusy(false);
    }
  };

  const toggleEditing = (id: string) => {
    setEditing((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-2">
        <Button
          aria-label="返回任务列表"
          className="gap-1 text-muted-foreground"
          onClick={onBack}
          title="返回任务列表"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          任务列表
        </Button>
        <span className="text-xs font-medium text-foreground">
          {findings.length} 条建议
        </span>
        <Button
          className="ml-auto"
          disabled={busy || readOnly}
          onClick={() => void acceptAll()}
          type="button"
          variant="ghost"
        >
          <CheckCheck />
          全部接受
        </Button>
        <Button
          disabled={busy || acceptedCount === 0 || readOnly}
          onClick={() => setConfirming(true)}
          type="button"
        >
          应用 {acceptedCount} 条
        </Button>
      </div>

      {readOnly ? (
        <div className="border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          该审查任务已应用，当前为只读状态。
        </div>
      ) : null}
      {success ? (
        <div className="border-b border-border bg-muted px-3 py-2 text-xs text-foreground">
          {success}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {findings.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
            这项审查没有发现需要修改的问题。
          </div>
        ) : (
          findings.map((finding) => {
            const draft = drafts[finding.id] ?? finding.targetText;
            const hasSuggestion = finding.suggestedTargetText !== null;
            const isEditing = editing.has(finding.id);
            return (
              <article
                className="rounded-md border border-border bg-card p-3"
                key={finding.id}
              >
                <div className="flex items-center gap-2">
                  <Badge variant={finding.severity === "error" ? "destructive" : "secondary"}>
                    {finding.category}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {finding.summary}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                    {Math.round(finding.confidence * 100)}%
                  </span>
                </div>

                {finding.evidence ? (
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {finding.evidence}
                  </p>
                ) : null}

                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground/70">源文</p>
                  <p className="whitespace-pre-wrap break-words rounded bg-muted px-2.5 py-2 text-xs leading-5 text-foreground">
                    {finding.sourceText}
                  </p>
                  {hasSuggestion ? (
                    <>
                      <p className="text-[11px] font-medium text-muted-foreground/70">
                        改动对比（红=删除，灰=新增）
                      </p>
                      <div className="rounded border border-border px-2.5 py-2">
                        <TranslationDiff after={draft} before={finding.targetText} />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] font-medium text-muted-foreground/70">当前译文</p>
                      <p className="whitespace-pre-wrap break-words rounded bg-muted px-2.5 py-2 text-xs leading-5 text-foreground">
                        {finding.targetText || "（空译文）"}
                      </p>
                    </>
                  )}
                  {isEditing && hasSuggestion && !readOnly ? (
                    <Textarea
                      aria-label="编辑建议译文"
                      className="min-h-16 text-xs leading-5 text-foreground"
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [finding.id]: event.target.value }))
                      }
                      value={draft}
                    />
                  ) : null}
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <Button
                    aria-label="接受建议"
                    disabled={busy || readOnly || !hasSuggestion}
                    onClick={() => void decide(finding, "accepted")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Check />
                    接受
                  </Button>
                  <Button
                    disabled={busy || readOnly || !hasSuggestion}
                    onClick={() => {
                      if (isEditing) void decide(finding, "edited", draft);
                      else toggleEditing(finding.id);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil />
                    {isEditing ? "保存修改" : "编辑"}
                  </Button>
                  <Button
                    aria-label="拒绝建议"
                    disabled={busy || readOnly}
                    onClick={() => void decide(finding, "rejected")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                    拒绝
                  </Button>
                  {finding.decision !== "pending" ? (
                    <Badge className="ml-auto" variant="outline">
                      {DECISION_LABEL[finding.decision]}
                    </Badge>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
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
            <AlertDialogCancel variant="ghost">返回检查</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void apply()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              确认写入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
