"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  History,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  TranslationHistoryEntry,
  TranslationTextUpdate,
  TranslationUnitRow,
} from "@/lib/desktop-types";

export type TranslationEditorHandle = {
  flushUntilSaved: () => Promise<void>;
};

type TranslationEditorProps = {
  row: TranslationUnitRow;
  onSave: (
    rowId: string,
    update: TranslationTextUpdate,
  ) => Promise<TranslationUnitRow>;
  onCopyText: (text: string) => Promise<void>;
  onSaved: (row: TranslationUnitRow) => void;
  canPrevious?: boolean;
  canNext?: boolean;
  editingLocked?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  history?: TranslationHistoryEntry[];
  historyError?: string;
  historyLoading?: boolean;
  onRestoreHistory?: (entry: TranslationHistoryEntry) => void | Promise<void>;
};

type SaveState = "saved" | "dirty" | "saving" | "error";

type TextSelection = {
  start: number;
  end: number;
};

type CopyFeedback = {
  field: "source" | "target";
  state: "success" | "error";
} | null;

export const TranslationEditor = forwardRef<
  TranslationEditorHandle,
  TranslationEditorProps
>(function TranslationEditor(
  {
    row,
    onSave,
    onCopyText,
    onSaved,
    canPrevious = false,
    canNext = false,
    editingLocked = false,
    onPrevious,
    onNext,
    history = [],
    historyError = "",
    historyLoading = false,
    onRestoreHistory,
  },
  ref,
) {
  const [sourceDraft, setSourceDraft] = useState(row.sourceText);
  const [targetDraft, setTargetDraft] = useState(row.targetText);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(row.updatedAt);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [findExpanded, setFindExpanded] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const draftRef = useRef<TranslationTextUpdate>({
    sourceText: row.sourceText,
    targetText: row.targetText,
  });
  const savedRef = useRef<TranslationTextUpdate>({
    sourceText: row.sourceText,
    targetText: row.targetText,
  });
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const targetTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const historyWasOpenRef = useRef(false);
  const pendingSelectionRef = useRef<TextSelection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const interactionLocked = editingLocked || restoringVersion !== null;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    const value = { ...draftRef.current };
    const save = async () => {
      if (sameUpdate(value, savedRef.current)) {
        return;
      }

      setSaveState("saving");
      try {
        const updated = await onSave(row.rowId, value);
        savedRef.current = {
          sourceText: updated.sourceText,
          targetText: updated.targetText,
        };
        setLastSavedAt(updated.updatedAt || new Date().toISOString());
        onSaved(updated);
        setSaveState(
          sameUpdate(draftRef.current, savedRef.current) ? "saved" : "dirty",
        );
      } catch (error) {
        setSaveState("error");
        throw error;
      }
    };
    const operation = queueRef.current.then(save, save);
    queueRef.current = operation.catch(() => undefined);
    return operation;
  }, [clearTimer, onSave, onSaved, row.rowId]);

  useEffect(
    () => () => {
      clearTimer();
      if (saveNoticeTimerRef.current) {
        clearTimeout(saveNoticeTimerRef.current);
      }
      if (copyNoticeTimerRef.current) {
        clearTimeout(copyNoticeTimerRef.current);
      }
    },
    [clearTimer],
  );

  const changeDraft = useCallback(
    (field: "sourceText" | "targetText", value: string) => {
      const nextDraft = { ...draftRef.current, [field]: value };
      draftRef.current = nextDraft;
      if (field === "sourceText") {
        setSourceDraft(value);
      } else {
        setTargetDraft(value);
      }
      setSaveState(sameUpdate(nextDraft, savedRef.current) ? "saved" : "dirty");
      clearTimer();
      if (!sameUpdate(nextDraft, savedRef.current)) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void flush().catch(() => undefined);
        }, 500);
      }
    },
    [clearTimer, flush],
  );

  const showExplicitSaveSuccess = useCallback(() => {
    if (saveNoticeTimerRef.current) {
      clearTimeout(saveNoticeTimerRef.current);
    }
    setShowSaveSuccess(true);
    saveNoticeTimerRef.current = setTimeout(() => {
      saveNoticeTimerRef.current = null;
      setShowSaveSuccess(false);
    }, 2_000);
  }, []);

  const flushUntilSaved = useCallback(async () => {
    do {
      await flush();
    } while (!sameUpdate(draftRef.current, savedRef.current));
  }, [flush]);

  useImperativeHandle(ref, () => ({ flushUntilSaved }), [flushUntilSaved]);

  const saveExplicitly = useCallback(async () => {
    try {
      await flushUntilSaved();
      showExplicitSaveSuccess();
      return true;
    } catch {
      return false;
    }
  }, [flushUntilSaved, showExplicitSaveSuccess]);

  const navigate = useCallback(
    async (direction: "previous" | "next") => {
      if (direction === "previous" ? !canPrevious : !canNext) {
        return;
      }
      try {
        await flushUntilSaved();
        if (direction === "previous") {
          onPrevious?.();
        } else {
          onNext?.();
        }
      } catch {
        // The save state already exposes the failure; navigation must stop here.
      }
    },
    [canNext, canPrevious, flushUntilSaved, onNext, onPrevious],
  );

  const saveAndNext = useCallback(async () => {
    if (!canNext) {
      return;
    }
    if (await saveExplicitly()) {
      onNext?.();
    }
  }, [canNext, onNext, saveExplicitly]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        interactionLocked ||
        event.isComposing ||
        (document.activeElement !== sourceTextareaRef.current &&
          document.activeElement !== targetTextareaRef.current)
      ) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (canNext) {
          event.preventDefault();
          void saveAndNext();
        }
        return;
      }
      if (!event.altKey) {
        return;
      }
      if (event.key === "ArrowUp" && canPrevious) {
        event.preventDefault();
        void navigate("previous");
      } else if (event.key === "ArrowDown" && canNext) {
        event.preventDefault();
        void navigate("next");
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [canNext, canPrevious, interactionLocked, navigate, saveAndNext]);

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current;
    if (!selection || !targetTextareaRef.current) {
      return;
    }
    pendingSelectionRef.current = null;
    targetTextareaRef.current.focus();
    targetTextareaRef.current.setSelectionRange(selection.start, selection.end);
  }, [selectionVersion]);

  useLayoutEffect(() => {
    if (historyOpen) {
      historyCloseButtonRef.current?.focus();
    } else if (historyWasOpenRef.current) {
      historyButtonRef.current?.focus();
    }
    historyWasOpenRef.current = historyOpen;
  }, [historyOpen]);

  const matches = useMemo(
    () => findMatchIndices(targetDraft, findQuery),
    [targetDraft, findQuery],
  );
  const activeMatch =
    matches.length === 0 ? 0 : Math.min(currentMatch, matches.length - 1);

  const queueSelection = (selection: TextSelection) => {
    pendingSelectionRef.current = selection;
    setSelectionVersion((version) => version + 1);
  };

  const selectMatch = (index: number, nextMatches = matches) => {
    if (!findQuery || nextMatches.length === 0) {
      return;
    }
    const normalized = (index + nextMatches.length) % nextMatches.length;
    const start = nextMatches[normalized];
    queueSelection({ start, end: start + findQuery.length });
    setCurrentMatch(normalized);
  };

  const updateFindQuery = (value: string) => {
    setFindQuery(value);
    setCurrentMatch(0);
    const nextMatches = findMatchIndices(draftRef.current.targetText, value);
    if (value && nextMatches.length > 0) {
      queueSelection({
        start: nextMatches[0],
        end: nextMatches[0] + value.length,
      });
    }
  };

  const replaceCurrent = () => {
    if (!findQuery || matches.length === 0) {
      return;
    }
    const currentDraft = draftRef.current.targetText;
    const currentMatches = findMatchIndices(currentDraft, findQuery);
    if (currentMatches.length === 0) {
      return;
    }
    const currentIndex = Math.min(activeMatch, currentMatches.length - 1);
    const start = currentMatches[currentIndex];
    const nextDraft = `${currentDraft.slice(0, start)}${replacement}${currentDraft.slice(start + findQuery.length)}`;
    const nextMatches = findMatchIndices(nextDraft, findQuery);
    const replacementEnd = start + replacement.length;
    const nextLogicalStart =
      nextMatches.find((index) => index >= replacementEnd) ??
      nextMatches.find((index) => index < start);
    changeDraft("targetText", nextDraft);
    if (nextLogicalStart !== undefined) {
      const nextMatch = nextMatches.indexOf(nextLogicalStart);
      setCurrentMatch(nextMatch);
      queueSelection({
        start: nextLogicalStart,
        end: nextLogicalStart + findQuery.length,
      });
    } else {
      setCurrentMatch(0);
      queueSelection({
        start: replacementEnd,
        end: replacementEnd,
      });
    }
  };

  const replaceAll = () => {
    if (!findQuery || matches.length === 0) {
      return;
    }
    const currentDraft = draftRef.current.targetText;
    const nextDraft = replaceLiteralAll(currentDraft, findQuery, replacement);
    const nextMatches = findMatchIndices(nextDraft, findQuery);
    changeDraft("targetText", nextDraft);
    setCurrentMatch(0);
    if (nextMatches.length > 0) {
      queueSelection({
        start: nextMatches[0],
        end: nextMatches[0] + findQuery.length,
      });
    }
  };

  const resetTranslation = () => {
    changeDraft("targetText", row.originalTargetText);
    void flush().catch(() => undefined);
  };

  const copyDraft = async (field: "source" | "target") => {
    const text =
      field === "source"
        ? draftRef.current.sourceText
        : draftRef.current.targetText;
    if (copyNoticeTimerRef.current) {
      clearTimeout(copyNoticeTimerRef.current);
    }
    try {
      await onCopyText(text);
      setCopyFeedback({ field, state: "success" });
    } catch {
      setCopyFeedback({ field, state: "error" });
    }
    copyNoticeTimerRef.current = setTimeout(() => {
      copyNoticeTimerRef.current = null;
      setCopyFeedback(null);
    }, 1_800);
  };

  const sortedHistory = useMemo(
    () => [...history].sort((left, right) => right.version - left.version),
    [history],
  );
  const importedSnapshot: TranslationHistoryEntry = {
    projectId: row.projectId,
    rowId: row.rowId,
    version: 0,
    previousSourceText: row.originalSourceText,
    sourceText: row.originalSourceText,
    previousTargetText: row.originalTargetText,
    targetText: row.originalTargetText,
    changedAt: row.updatedAt,
  };

  const restoreHistory = async (entry: TranslationHistoryEntry) => {
    if (!onRestoreHistory || restoringRef.current) {
      return;
    }
    restoringRef.current = true;
    setRestoringVersion(entry.version);
    setRestoreError("");
    try {
      await onRestoreHistory(entry);
    } catch {
      setRestoreError("恢复失败，请重试");
    } finally {
      restoringRef.current = false;
      setRestoringVersion(null);
    }
  };

  return (
    <aside className="relative flex min-h-0 w-[420px] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
      <div
        aria-hidden={historyOpen || undefined}
        className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4"
        inert={historyOpen}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">翻译编辑</h2>
          <p className="truncate text-xs text-slate-500">{row.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end">
            {showSaveSuccess ? (
              <span
                className="text-xs font-medium text-emerald-700"
                role="status"
              >
                保存成功
              </span>
            ) : null}
            <span
              className={
                saveState === "error"
                  ? "text-xs text-red-700"
                  : saveState === "dirty"
                    ? "text-xs text-amber-700"
                    : "text-xs text-slate-500"
              }
            >
              {formatSaveState(saveState, lastSavedAt)}
            </span>
          </div>
          <button
            aria-label="修改记录"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => setHistoryOpen(true)}
            ref={historyButtonRef}
            type="button"
          >
            <History size={14} />
            记录
          </button>
        </div>
      </div>

      <div
        aria-hidden={historyOpen || undefined}
        className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin"
        data-testid="editor-surface"
        inert={historyOpen}
      >
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-600">源文本</h3>
            <div className="flex items-center gap-2">
              {copyFeedback?.field === "source" ? (
                <span
                  className={
                    copyFeedback.state === "success"
                      ? "text-xs text-emerald-700"
                      : "text-xs text-red-700"
                  }
                  role={copyFeedback.state === "error" ? "alert" : "status"}
                >
                  {copyFeedback.state === "success"
                    ? "已复制"
                    : "复制失败，请重试"}
                </span>
              ) : null}
              <IconButton
                disabled={interactionLocked}
                label="复制源文本"
                onClick={() => void copyDraft("source")}
                title="复制源文本"
              >
                <Copy size={14} />
              </IconButton>
            </div>
          </div>
          <textarea
            aria-label="源文本"
            className="min-h-28 w-full resize-y rounded border border-slate-300 bg-white p-3 text-sm leading-6 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            disabled={interactionLocked}
            onBlur={() => void flush().catch(() => undefined)}
            onChange={(event) => changeDraft("sourceText", event.target.value)}
            ref={sourceTextareaRef}
            value={sourceDraft}
          />
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-600">目标文本</h3>
            <div className="flex items-center gap-1">
              {copyFeedback?.field === "target" ? (
                <span
                  className={
                    copyFeedback.state === "success"
                      ? "mr-1 text-xs text-emerald-700"
                      : "mr-1 text-xs text-red-700"
                  }
                  role={copyFeedback.state === "error" ? "alert" : "status"}
                >
                  {copyFeedback.state === "success"
                    ? "已复制"
                    : "复制失败，请重试"}
                </span>
              ) : null}
              <IconButton
                disabled={interactionLocked}
                label="复制目标文本"
                onClick={() => void copyDraft("target")}
                title="复制目标文本"
              >
                <Copy size={14} />
              </IconButton>
              <IconButton
                disabled={interactionLocked}
                label="恢复原文"
                onClick={resetTranslation}
                title="恢复原文"
              >
                <RotateCcw size={14} />
              </IconButton>
              <IconButton
                disabled={interactionLocked}
                label={findExpanded ? "收起查找替换" : "展开查找替换"}
                onClick={() => setFindExpanded((expanded) => !expanded)}
                title="查找替换"
              >
                <Search size={14} />
              </IconButton>
            </div>
          </div>

          {findExpanded ? (
            <div className="mb-2 space-y-2 rounded border border-slate-200 bg-white p-2">
              <div className="grid grid-cols-2 gap-2">
                <textarea
                  aria-label="查找内容"
                  className="h-8 min-w-0 resize-none rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  disabled={interactionLocked}
                  onChange={(event) => updateFindQuery(event.target.value)}
                  placeholder="查找"
                  rows={1}
                  value={findQuery}
                />
                <input
                  aria-label="替换为"
                  className="h-8 min-w-0 rounded border border-slate-300 px-2 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  disabled={interactionLocked}
                  onChange={(event) => setReplacement(event.target.value)}
                  placeholder="替换为"
                  value={replacement}
                />
              </div>
              <div className="flex min-w-0 items-center gap-1">
                <span className="mr-auto whitespace-nowrap text-xs tabular-nums text-slate-500">
                  {matches.length === 0
                    ? "0 / 0"
                    : `${activeMatch + 1} / ${matches.length}`}
                </span>
                <IconButton
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  label="上一个匹配"
                  onClick={() => selectMatch(activeMatch - 1)}
                  title="上一个匹配"
                >
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  label="下一个匹配"
                  onClick={() => selectMatch(activeMatch + 1)}
                  title="下一个匹配"
                >
                  <ChevronDown size={14} />
                </IconButton>
                <button
                  className="h-7 whitespace-nowrap rounded border border-slate-300 px-2 text-xs text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  onClick={replaceCurrent}
                  type="button"
                >
                  替换当前
                </button>
                <button
                  className="h-7 whitespace-nowrap rounded border border-slate-300 px-2 text-xs text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  onClick={replaceAll}
                  type="button"
                >
                  全部替换
                </button>
              </div>
            </div>
          ) : null}

          <textarea
            aria-label="目标文本"
            className="min-h-44 w-full resize-y rounded border border-slate-300 bg-white p-3 text-sm leading-6 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            disabled={interactionLocked}
            onBlur={() => void flush().catch(() => undefined)}
            onChange={(event) => changeDraft("targetText", event.target.value)}
            ref={targetTextareaRef}
            value={targetDraft}
          />
        </section>

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <Info label="源语言" value={row.sourceLang} />
          <Info label="目标语言" value={row.targetLang} />
          <Info label="位置" value={String(row.position)} />
          <Info label="重复项" value={row.duplicate ? "是" : "否"} />
        </div>

        <div className="mt-2">
          {Object.keys(row.metadata).length > 0 ? (
            <EditorField label="元数据">
              <dl className="space-y-2 rounded border border-slate-200 bg-white p-3 text-xs">
                {Object.entries(row.metadata).map(([key, value]) => (
                  <div className="grid grid-cols-[110px_1fr] gap-2" key={key}>
                    <dt className="truncate text-slate-500">{key}</dt>
                    <dd className="break-words text-slate-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </EditorField>
          ) : null}
        </div>
      </div>

      {historyOpen ? (
        <aside
          aria-label="修改记录"
          className="absolute inset-0 z-20 flex flex-col bg-slate-50 shadow-xl"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">修改记录</h2>
              <p className="text-xs text-slate-500">{row.id}</p>
            </div>
            <IconButton
              buttonRef={historyCloseButtonRef}
              label="关闭修改记录"
              onClick={() => setHistoryOpen(false)}
              title="关闭修改记录"
            >
              <X size={16} />
            </IconButton>
          </header>
          <div
            className="min-h-0 flex-1 space-y-3 overflow-auto p-4"
            data-testid="translation-history"
          >
            {restoreError || historyError ? (
              <p
                className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
                role="alert"
              >
                {restoreError || historyError}
              </p>
            ) : historyLoading ? (
              <p className="text-xs text-slate-500">正在加载修改记录...</p>
            ) : (
              <>
                {sortedHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无修改记录</p>
                ) : (
                  sortedHistory.map((entry) => (
                    <article
                      className="rounded border border-slate-200 bg-white p-3"
                      key={entry.version}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">
                            版本 {entry.version}
                          </p>
                          <time
                            className="text-[11px] text-slate-500"
                            dateTime={entry.changedAt}
                          >
                            {formatHistoryTime(entry.changedAt)}
                          </time>
                        </div>
                        <button
                          className="h-7 shrink-0 rounded border border-slate-300 px-2 text-xs text-slate-700 disabled:opacity-40"
                          disabled={interactionLocked || !onRestoreHistory}
                          onClick={() => void restoreHistory(entry)}
                          type="button"
                        >
                          恢复此版本
                        </button>
                      </div>
                      <p className="mt-3 text-[11px] font-medium text-slate-500">
                        源文本
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                        {entry.sourceText || "（空）"}
                      </p>
                      <p className="mt-3 text-[11px] font-medium text-slate-500">
                        目标文本
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                        {entry.targetText || "（空译文）"}
                      </p>
                    </article>
                  ))
                )}
                <article className="rounded border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">
                      导入版本
                    </p>
                    <button
                      className="h-7 shrink-0 rounded border border-slate-300 px-2 text-xs text-slate-700 disabled:opacity-40"
                      disabled={interactionLocked || !onRestoreHistory}
                      onClick={() => void restoreHistory(importedSnapshot)}
                      type="button"
                    >
                      恢复此版本
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] font-medium text-slate-500">
                    源文本
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {importedSnapshot.sourceText || "（空）"}
                  </p>
                  <p className="mt-3 text-[11px] font-medium text-slate-500">
                    目标文本
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                    {importedSnapshot.targetText || "（空译文）"}
                  </p>
                </article>
              </>
            )}
          </div>
        </aside>
      ) : null}

      <div
        aria-hidden={historyOpen || undefined}
        className="grid h-14 shrink-0 grid-cols-[36px_36px_minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-1 border-t border-slate-200 bg-white px-2"
        data-testid="editor-actions"
        inert={historyOpen}
      >
        <TooltipIconButton
          disabled={interactionLocked || !canPrevious}
          label="上一条"
          onClick={() => void navigate("previous")}
          shortcut="Alt+↑"
        >
          <ArrowLeft size={16} />
        </TooltipIconButton>
        <TooltipIconButton
          disabled={interactionLocked || !canNext}
          label="下一条"
          onClick={() => void navigate("next")}
          shortcut="Alt+↓"
        >
          <ArrowRight size={16} />
        </TooltipIconButton>
        <button
          className="inline-flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded border border-blue-700 px-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={interactionLocked}
          onClick={() => void saveExplicitly()}
          type="button"
        >
          <Save className="shrink-0" size={14} />
          <span className="truncate">立即保存</span>
        </button>
        <button
          className="inline-flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded bg-blue-700 px-2 text-xs font-medium text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={interactionLocked || !canNext}
          onClick={() => void saveAndNext()}
          type="button"
        >
          <Save className="shrink-0" size={14} />
          <span className="truncate">保存并下一条</span>
        </button>
      </div>
    </aside>
  );
});

function findMatchIndices(text: string, query: string) {
  if (!query) {
    return [];
  }
  const matches: number[] = [];
  let start = 0;
  while (start <= text.length - query.length) {
    const index = text.indexOf(query, start);
    if (index === -1) {
      break;
    }
    matches.push(index);
    start = index + query.length;
  }
  return matches;
}

function replaceLiteralAll(text: string, query: string, replacement: string) {
  if (!query) {
    return text;
  }
  return text.split(query).join(replacement);
}

function sameUpdate(left: TranslationTextUpdate, right: TranslationTextUpdate) {
  return (
    left.sourceText === right.sourceText && left.targetText === right.targetText
  );
}

function formatSaveState(saveState: SaveState, lastSavedAt: string) {
  if (saveState === "saving") {
    return "保存中";
  }
  if (saveState === "dirty") {
    return "待保存";
  }
  if (saveState === "error") {
    return "保存失败";
  }
  const time = formatClockTime(lastSavedAt);
  return time ? `已保存 ${time}` : "已保存";
}

function formatClockTime(value: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function IconButton({
  buttonRef,
  children,
  disabled = false,
  label,
  onClick,
  title,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function TooltipIconButton({
  children,
  disabled,
  label,
  onClick,
  shortcut,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded border border-slate-300 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {label} {shortcut}
      </span>
    </span>
  );
}

function EditorField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-semibold text-slate-600">{label}</h3>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-2.5">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-800" title={value}>
        {value}
      </div>
    </div>
  );
}
