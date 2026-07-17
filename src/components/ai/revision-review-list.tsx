"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  SquarePen,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TranslationDiff } from "@/components/ai/translation-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AiAgentRevisionRecord } from "@/lib/desktop-types";

type RevisionReviewListProps = {
  /** 待审阅（pending）的修改建议。 */
  revisions: AiAgentRevisionRecord[];
  busy: boolean;
  onUpdate: (id: string, suggestedTargetText: string) => Promise<boolean>;
  onApply: (ids: string[]) => void;
  onIgnore: (ids: string[]) => void;
};

const CATEGORY_LABEL: Record<string, string> = {
  accuracy: "准确性",
  fluency: "流畅度",
  terminology: "术语",
  consistency: "一致性",
  punctuation: "标点",
  formatting: "格式",
};

/**
 * 会话底部的待审阅面板：逐条可展开查看改动对比，勾选“修改范围”，确认后应用所选。
 * 不自动展开全部内容，也不会未经勾选就写库。
 */
export function RevisionReviewList({
  revisions,
  busy,
  onUpdate,
  onApply,
  onIgnore,
}: RevisionReviewListProps) {
  const ids = useMemo(() => revisions.map((r) => r.id), [revisions]);
  const signature = ids.join(",");
  const [panelOpen, setPanelOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(ids));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelected(new Set(signature ? signature.split(",") : []));
  }, [signature]);

  const selectedIds = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(ids) : new Set());
  };
  const toggleRow = (id: string) => {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const startEditing = (revision: AiAgentRevisionRecord) => {
    setDrafts((current) => ({
      ...current,
      [revision.id]: revision.suggestedTargetText,
    }));
    setEditingId(revision.id);
  };
  const cancelEditing = (revision: AiAgentRevisionRecord) => {
    setDrafts((current) => ({
      ...current,
      [revision.id]: revision.suggestedTargetText,
    }));
    setEditingId(null);
  };
  const saveEditing = async (revision: AiAgentRevisionRecord) => {
    const draft = drafts[revision.id] ?? revision.suggestedTargetText;
    if (!draft.trim()) return;
    if (await onUpdate(revision.id, draft)) {
      setEditingId(null);
    }
  };

  return (
    <Collapsible
      className="border-t bg-muted/30"
      onOpenChange={setPanelOpen}
      open={panelOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground"
          type="button"
        >
          <SquarePen className="text-primary" size={14} />
          待审阅修改建议
          <Badge className="rounded-full px-1.5" variant="secondary">
            {revisions.length}
          </Badge>
          <ChevronDown
            className={cn(
              "ml-auto text-muted-foreground transition-transform",
              panelOpen && "rotate-180",
            )}
            size={14}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex items-center gap-2 px-3 pb-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              aria-label="全选"
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              disabled={busy}
              onCheckedChange={(checked) => toggleAll(checked === true)}
            />
            已选 {selectedIds.length}/{revisions.length}
          </label>
          <Button
            className="ml-auto h-7 px-2 text-xs text-muted-foreground"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onIgnore(selectedIds)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X size={13} />
            忽略所选
          </Button>
          <Button
            className="h-7 gap-1 px-2.5 text-xs"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onApply(selectedIds)}
            size="sm"
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            应用所选
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {revisions.map((revision) => {
            const open = openRows.has(revision.id);
            const editing = editingId === revision.id;
            const draft = drafts[revision.id] ?? revision.suggestedTargetText;
            return (
              <Collapsible
                className="mb-1.5 overflow-hidden rounded-lg border bg-background last:mb-0"
                key={revision.id}
                onOpenChange={() => toggleRow(revision.id)}
                open={open}
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <Checkbox
                    aria-label={`选择建议：${revision.sourceText}`}
                    checked={selected.has(revision.id)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      toggleSelect(revision.id, checked === true)
                    }
                  />
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      type="button"
                    >
                      <Badge className="shrink-0 rounded-full px-1.5 font-normal" variant="outline">
                        {CATEGORY_LABEL[revision.category] ?? revision.category}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {revision.sourceText}
                      </span>
                      <ChevronDown
                        className={cn(
                          "shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                        size={13}
                      />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <Separator />
                  <div className="space-y-2 px-2.5 py-2.5">
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                        改动对比
                      </p>
                      <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                        <TranslationDiff
                          after={editing ? draft : revision.suggestedTargetText}
                          before={revision.originalTargetText}
                        />
                      </div>
                    </div>
                    {editing ? (
                      <div className="space-y-2">
                        <Textarea
                          aria-label={`编辑建议译文：${revision.sourceText}`}
                          className="min-h-20 text-xs leading-5"
                          disabled={busy}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [revision.id]: event.target.value,
                            }))
                          }
                          value={draft}
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            disabled={busy}
                            onClick={() => cancelEditing(revision)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            取消
                          </Button>
                          <Button
                            disabled={busy || !draft.trim()}
                            onClick={() => void saveEditing(revision)}
                            size="sm"
                            type="button"
                          >
                            {busy ? <Loader2 className="animate-spin" /> : <Check />}
                            保存修改
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <Button
                          aria-label="编辑建议"
                          disabled={busy}
                          onClick={() => startEditing(revision)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil />
                          编辑
                        </Button>
                      </div>
                    )}
                    {revision.reason ? (
                      <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
                        {revision.reason}
                        <span className="ml-1 tabular-nums opacity-70">
                          （置信度 {Math.round(revision.confidence * 100)}%）
                        </span>
                      </p>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
