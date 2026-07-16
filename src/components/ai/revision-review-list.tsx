"use client";

import { ChevronDown, ClipboardCheck, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AiAgentRevisionRecord } from "@/lib/desktop-types";

type RevisionReviewListProps = {
  /** 待审阅（pending）的修改建议。 */
  revisions: AiAgentRevisionRecord[];
  busy: boolean;
  onApply: (ids: string[]) => void;
  onIgnore: (ids: string[]) => void;
};

/**
 * 会话底部的待审阅面板：逐条可展开查看，勾选“修改范围”，确认后应用所选。
 * 不会自动弹出全部内容，也不会未经勾选就写库。
 */
export function RevisionReviewList({
  revisions,
  busy,
  onApply,
  onIgnore,
}: RevisionReviewListProps) {
  const ids = useMemo(() => revisions.map((r) => r.id), [revisions]);
  const signature = ids.join(",");
  const [panelOpen, setPanelOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(ids));

  // 建议集合变化时（新一轮生成 / 应用后移除）默认全选当前待审阅项。
  useEffect(() => {
    setSelected(new Set(signature ? signature.split(",") : []));
  }, [signature]);

  const selectedIds = ids.filter((id) => selected.has(id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Collapsible
      className="border-t border-amber-200 bg-amber-50/50"
      onOpenChange={setPanelOpen}
      open={panelOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800"
          type="button"
        >
          <ClipboardCheck size={14} />
          待审阅修改建议 ({revisions.length})
          <ChevronDown
            className={cn(
              "ml-auto transition-transform",
              panelOpen && "rotate-180",
            )}
            size={14}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="max-h-64 overflow-y-auto border-t border-amber-100 bg-white">
          {revisions.map((revision) => {
            const open = openRows.has(revision.id);
            return (
              <div
                className="border-b border-slate-100 last:border-b-0"
                key={revision.id}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    aria-label={`选择 ${revision.rowId}`}
                    checked={selected.has(revision.id)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      toggleSelect(revision.id, checked === true)
                    }
                  />
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                    onClick={() => toggleRow(revision.id)}
                    type="button"
                  >
                    <Badge
                      className="shrink-0 font-normal text-muted-foreground"
                      variant="outline"
                    >
                      {revision.category}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {revision.rowId}：{revision.suggestedTargetText}
                    </span>
                    <ChevronDown
                      className={cn(
                        "shrink-0 text-slate-400 transition-transform",
                        open && "rotate-180",
                      )}
                      size={13}
                    />
                  </button>
                </div>
                {open ? (
                  <div className="space-y-2 px-3 pb-3 pl-9 text-xs">
                    <div>
                      <p className="mb-0.5 text-[11px] font-medium text-slate-400">
                        原译文
                      </p>
                      <p className="whitespace-pre-wrap break-words text-slate-500 line-through decoration-slate-300">
                        {revision.originalTargetText || "（空译文）"}
                      </p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[11px] font-medium text-slate-400">
                        建议译文
                      </p>
                      <p className="whitespace-pre-wrap break-words font-medium text-slate-900">
                        {revision.suggestedTargetText}
                      </p>
                    </div>
                    {revision.reason ? (
                      <p className="rounded bg-slate-50 px-2 py-1.5 leading-5 text-slate-600">
                        {revision.reason}
                        <span className="ml-1 text-slate-400">
                          （置信度 {Math.round(revision.confidence * 100)}%）
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
          <span className="min-w-0 flex-1">
            已选 {selectedIds.length} / {revisions.length} 条
          </span>
          <Button
            className="h-7 gap-1 px-2 text-slate-500 hover:text-slate-700"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onIgnore(selectedIds)}
            size="sm"
            type="button"
            variant="ghost"
          >
            忽略所选
          </Button>
          <Button
            className="h-7 gap-1 px-2.5"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onApply(selectedIds)}
            size="sm"
            type="button"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={13} />
            ) : (
              <ClipboardCheck size={13} />
            )}
            应用所选
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
