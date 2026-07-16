"use client";

import { Loader2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiAuditBoundaries,
  ProjectFilters,
  TmxDesktopApi,
} from "@/lib/desktop-types";
import { DEFAULT_PROJECT_FILTERS } from "@/lib/workspace-state";

type ConfigApi = Pick<
  TmxDesktopApi,
  "queryProject" | "getAiAuditDefaults" | "saveAiAuditDefaults"
>;

type AuditTaskConfigDialogProps = {
  api: ConfigApi;
  projectId: string;
  targetLanguages: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (filters: ProjectFilters, boundaries: AiAuditBoundaries) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

export function AuditTaskConfigDialog({
  api,
  projectId,
  targetLanguages,
  open,
  onOpenChange,
  onStart,
}: AuditTaskConfigDialogProps) {
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState<ProjectFilters>({
    ...DEFAULT_PROJECT_FILTERS,
  });
  const [customRules, setCustomRules] = useState("");
  const [minConfidence, setMinConfidence] = useState("0.8");
  const [allowRewrite, setAllowRewrite] = useState(true);
  const [concurrency, setConcurrency] = useState(8);
  const [resultCount, setResultCount] = useState(0);
  const [countLoading, setCountLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const countRequestIdRef = useRef(0);

  // 打开时加载默认规则/并发。
  useEffect(() => {
    if (!open) return;
    let active = true;
    api.getAiAuditDefaults().then((defaults) => {
      if (!active) return;
      setCustomRules(defaults.customRules);
      setMinConfidence(String(defaults.minConfidence));
      setAllowRewrite(defaults.allowRewrite);
      setConcurrency(defaults.concurrency);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [api, open]);

  // 预估审查条数。
  useEffect(() => {
    if (!open) return;
    const requestId = ++countRequestIdRef.current;
    setCountLoading(true);
    api.queryProject({ projectId, filters, page: 1, pageSize: 100 })
      .then((result) => {
        if (requestId === countRequestIdRef.current) setResultCount(result.total);
      })
      .catch(() => {
        if (requestId === countRequestIdRef.current) setResultCount(0);
      })
      .finally(() => {
        if (requestId === countRequestIdRef.current) setCountLoading(false);
      });
  }, [api, filters, open, projectId]);

  const updateFilters = (update: Partial<ProjectFilters>) =>
    setFilters((current) => ({ ...current, ...update }));

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const boundaries: AiAuditBoundaries = {
        customRules: customRules.trim(),
        minConfidence: Number(minConfidence),
        allowRewrite,
        concurrency,
      };
      await api.saveAiAuditDefaults(boundaries);
      await onStart(filters, boundaries);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-slate-200 px-4 py-3">
          <DialogTitle className="text-sm">新建审查任务</DialogTitle>
          <DialogDescription className="text-xs">
            冻结所选范围逐条审查，AI 只暂存建议，完成后审阅再写库。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900">审查范围</h4>
            <div className="flex gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={14}
                />
                <Input
                  aria-label="审查搜索"
                  className="h-9 bg-white pl-8"
                  onChange={(event) => setDraftQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      updateFilters({ query: draftQuery.trim() });
                    }
                  }}
                  placeholder="搜索源文或译文，回车确认"
                  value={draftQuery}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                onValueChange={(value) =>
                  updateFilters({ targetLanguage: value === "__all__" ? "" : value })
                }
                value={filters.targetLanguage || "__all__"}
              >
                <SelectTrigger aria-label="目标语言" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="__all__">全部目标语言</SelectItem>
                  {targetLanguages.map((language) => (
                    <SelectItem key={language} value={language}>
                      {language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) =>
                  updateFilters({ status: value as ProjectFilters["status"] })
                }
                value={filters.status}
              >
                <SelectTrigger aria-label="翻译状态" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="changed">仅已修改</SelectItem>
                  <SelectItem value="empty">仅空译文</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <Checkbox
                checked={filters.duplicateOnly}
                onCheckedChange={(checked) =>
                  updateFilters({ duplicateOnly: checked === true })
                }
              />
              仅重复项
              <span className="ml-auto tabular-nums text-slate-500" role="status">
                {countLoading ? "统计中..." : `预计 ${resultCount.toLocaleString()} 条`}
              </span>
            </label>
          </section>

          <section className="space-y-1.5 border-t border-slate-200 pt-3">
            <h4 className="text-xs font-semibold text-slate-900">审查规则</h4>
            <p className="text-[11px] text-slate-500">
              自由描述要求，例如术语表、语气、数字/标点规范、需忽略的差异等。
            </p>
            <Textarea
              aria-label="审查规则"
              className="min-h-24 bg-white text-xs leading-5"
              onChange={(event) => setCustomRules(event.target.value)}
              placeholder="例如：术语「服务器」统一译为 server；保持正式语气；忽略中英文标点差异。"
              value={customRules}
            />
          </section>

          <section className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
            <label className="space-y-1.5 text-xs font-medium text-slate-700">
              最低置信度
              <Select onValueChange={setMinConfidence} value={minConfidence}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.7">70%</SelectItem>
                  <SelectItem value="0.8">80%</SelectItem>
                  <SelectItem value="0.9">90%</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
              <Checkbox
                checked={allowRewrite}
                onCheckedChange={(checked) => setAllowRewrite(checked === true)}
              />
              生成纠正译文
            </label>
            <label className="col-span-2 space-y-1.5 text-xs font-medium text-slate-700">
              <span className="flex items-center justify-between">
                并发审查数
                <span className="tabular-nums text-slate-500">{concurrency}</span>
              </span>
              <input
                aria-label="并发审查数"
                className="w-full accent-blue-600"
                max={20}
                min={1}
                onChange={(event) => setConcurrency(Number(event.target.value))}
                type="range"
                value={concurrency}
              />
              <span className="text-[11px] font-normal text-slate-400">
                1–20，越大越快但更容易触发接口限流。
              </span>
            </label>
          </section>

          {error ? (
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-slate-200 px-4 py-3">
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            取消
          </Button>
          <Button
            disabled={busy || countLoading || resultCount === 0}
            onClick={() => void start()}
            size="sm"
            type="button"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            开始审查 {resultCount > 0 ? `(${resultCount.toLocaleString()})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
