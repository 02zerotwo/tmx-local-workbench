"use client";

import { Check, Loader2, PencilLine, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiAgentRevisionRecord } from "@/lib/desktop-types";

type RevisionProposalCardProps = {
  revision: AiAgentRevisionRecord;
  busy?: boolean;
  onApply: (revisionId: string) => void;
  onIgnore: (revisionId: string) => void;
};

const STATUS_META: Record<
  AiAgentRevisionRecord["status"],
  { label: string; className: string }
> = {
  pending: { label: "待审阅", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  applied: { label: "已应用", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  ignored: { label: "已忽略", className: "bg-muted text-muted-foreground" },
  stale: { label: "已过期", className: "bg-destructive/10 text-destructive" },
};

export function RevisionProposalCard({
  revision,
  busy = false,
  onApply,
  onIgnore,
}: RevisionProposalCardProps) {
  const pending = revision.status === "pending";
  const status = STATUS_META[revision.status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <PencilLine className="text-blue-700" size={14} />
        <span className="font-medium text-slate-700">修改建议</span>
        <Badge className="font-normal text-muted-foreground" variant="outline">
          {revision.category}
        </Badge>
        <Badge className={status.className} variant="secondary">
          {status.label}
        </Badge>
        <span className="ml-auto tabular-nums text-slate-400">
          置信度 {Math.round(revision.confidence * 100)}%
        </span>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <div>
          <p className="mb-0.5 text-[11px] font-medium text-slate-400">原译文</p>
          <p className="whitespace-pre-wrap break-words text-slate-500 line-through decoration-slate-300">
            {revision.originalTargetText || "（空译文）"}
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-[11px] font-medium text-slate-400">建议译文</p>
          <p className="whitespace-pre-wrap break-words font-medium text-slate-900">
            {revision.suggestedTargetText}
          </p>
        </div>
        {revision.reason ? (
          <p className="rounded bg-slate-50 px-2 py-1.5 leading-5 text-slate-600">
            {revision.reason}
          </p>
        ) : null}
      </div>

      {pending ? (
        <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 px-3 py-2">
          <Button
            className="h-7 gap-1 px-2 text-xs text-slate-500 hover:text-slate-700"
            disabled={busy}
            onClick={() => onIgnore(revision.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X size={13} />
            忽略
          </Button>
          <Button
            className="h-7 gap-1 px-2.5 text-xs"
            disabled={busy}
            onClick={() => onApply(revision.id)}
            size="sm"
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            应用
          </Button>
        </div>
      ) : null}
    </div>
  );
}
