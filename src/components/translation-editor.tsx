"use client";

import {
  ArrowLeft,
  ArrowRight,
  CaseSensitive as CaseSensitiveIcon,
  CaseUpper,
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
  Fragment,
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
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type TextMatch = TextSelection;

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
  const [findDraft, setFindDraft] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
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
  const targetHighlightRef = useRef<HTMLDivElement>(null);
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
    () => findMatchRanges(targetDraft, findQuery, caseSensitive),
    [caseSensitive, findQuery, targetDraft],
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
    queueSelection(nextMatches[normalized]);
    setCurrentMatch(normalized);
  };

  const updateFindDraft = (value: string) => {
    setFindDraft(value);
    setFindQuery("");
    setCurrentMatch(0);
  };

  const submitFind = (nextCaseSensitive = caseSensitive) => {
    setFindQuery(findDraft);
    setCurrentMatch(0);
    const nextMatches = findMatchRanges(
      draftRef.current.targetText,
      findDraft,
      nextCaseSensitive,
    );
    if (findDraft && nextMatches.length > 0) {
      queueSelection(nextMatches[0]);
    }
  };

  const toggleCaseSensitive = () => {
    const nextCaseSensitive = !caseSensitive;
    setCaseSensitive(nextCaseSensitive);
    if (findQuery) {
      setCurrentMatch(0);
      const nextMatches = findMatchRanges(
        draftRef.current.targetText,
        findQuery,
        nextCaseSensitive,
      );
      if (nextMatches.length > 0) {
        queueSelection(nextMatches[0]);
      }
    }
  };

  const replaceCurrent = () => {
    if (!findQuery || matches.length === 0) {
      return;
    }
    const currentDraft = draftRef.current.targetText;
    const currentMatches = findMatchRanges(
      currentDraft,
      findQuery,
      caseSensitive,
    );
    if (currentMatches.length === 0) {
      return;
    }
    const currentIndex = Math.min(activeMatch, currentMatches.length - 1);
    const currentRange = currentMatches[currentIndex];
    const { start, end } = currentRange;
    const nextDraft = `${currentDraft.slice(0, start)}${replacement}${currentDraft.slice(end)}`;
    const nextMatches = findMatchRanges(nextDraft, findQuery, caseSensitive);
    const replacementEnd = start + replacement.length;
    const nextLogicalStart =
      nextMatches.find((match) => match.start >= replacementEnd) ??
      nextMatches.find((match) => match.start < start);
    changeDraft("targetText", nextDraft);
    if (nextLogicalStart !== undefined) {
      const nextMatch = nextMatches.indexOf(nextLogicalStart);
      setCurrentMatch(nextMatch);
      queueSelection(nextLogicalStart);
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
    const nextDraft = replaceLiteralAll(
      currentDraft,
      findQuery,
      replacement,
      caseSensitive,
    );
    const nextMatches = findMatchRanges(nextDraft, findQuery, caseSensitive);
    changeDraft("targetText", nextDraft);
    setCurrentMatch(0);
    if (nextMatches.length > 0) {
      queueSelection(nextMatches[0]);
    }
  };

  const capitalizeTargetSelection = () => {
    const textarea = targetTextareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      return;
    }
    const currentDraft = draftRef.current.targetText;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    const selectedText = currentDraft.slice(selection.start, selection.end);
    const capitalizedSelection = capitalizeFirstEnglishLetter(selectedText);
    const nextDraft = `${currentDraft.slice(0, selection.start)}${capitalizedSelection}${currentDraft.slice(selection.end)}`;
    if (nextDraft !== currentDraft) {
      changeDraft("targetText", nextDraft);
    }
    queueSelection(selection);
  };

  const syncHighlightScroll = (textarea: HTMLTextAreaElement) => {
    if (!targetHighlightRef.current) {
      return;
    }
    targetHighlightRef.current.scrollTop = textarea.scrollTop;
    targetHighlightRef.current.scrollLeft = textarea.scrollLeft;
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
    <aside className="relative flex min-h-0 w-full shrink-0 flex-col border-l border-slate-200 bg-slate-50">
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
          <Button
            aria-label="修改记录"
            className="h-9 shrink-0 px-2"
            onClick={() => setHistoryOpen(true)}
            ref={historyButtonRef}
            type="button"
          >
            <History size={14} />
            记录
          </Button>
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
          <Textarea
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
                label="选中区域首字母大写"
                onClick={capitalizeTargetSelection}
                title="将选中区域的首个英文字母转为大写"
              >
                <CaseUpper size={15} />
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
              <div className="flex min-w-0 gap-1">
                <Textarea
                  aria-label="查找内容"
                  className="h-8 min-w-0 flex-1 resize-none rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  disabled={interactionLocked}
                  onChange={(event) => updateFindDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      submitFind();
                    }
                  }}
                  placeholder="查找"
                  rows={1}
                  value={findDraft}
                />
                <Button
                  aria-label="区分大小写"
                  aria-pressed={caseSensitive}
                  className={
                    caseSensitive
                      ? "size-8 shrink-0 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "size-8 shrink-0 text-slate-600"
                  }
                  disabled={interactionLocked}
                  onClick={toggleCaseSensitive}
                  title="区分大小写"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <CaseSensitiveIcon size={15} />
                </Button>
                <Button
                  aria-label="执行查找"
                  className="size-8 shrink-0 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                  disabled={interactionLocked || !findDraft}
                  onClick={() => submitFind()}
                  title="执行查找（Enter）"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Search size={14} />
                </Button>
              </div>
              <Input
                aria-label="替换为"
                className="h-8 w-full min-w-0 rounded border border-slate-300 px-2 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                disabled={interactionLocked}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder="替换为"
                value={replacement}
              />
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
                <Button
                  className="h-7 whitespace-nowrap px-2 text-xs text-slate-700"
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  onClick={replaceCurrent}
                  title="替换当前匹配"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  替换当前
                </Button>
                <Button
                  className="h-7 whitespace-nowrap px-2 text-xs text-slate-700"
                  disabled={
                    interactionLocked || !findQuery || matches.length === 0
                  }
                  onClick={replaceAll}
                  title="替换全部匹配"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  全部替换
                </Button>
              </div>
            </div>
          ) : null}

          <div className="relative rounded bg-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-px overflow-hidden rounded text-transparent"
              ref={targetHighlightRef}
            >
              <div className="min-h-full whitespace-pre-wrap break-words p-3 text-sm leading-6">
                <HighlightedText
                  activeMatch={activeMatch}
                  matches={matches}
                  text={targetDraft}
                />
              </div>
            </div>
            <Textarea
              aria-label="目标文本"
              className="relative z-10 min-h-44 w-full resize-y rounded border border-slate-300 bg-transparent p-3 text-sm leading-6 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              disabled={interactionLocked}
              onBlur={() => void flush().catch(() => undefined)}
              onChange={(event) =>
                changeDraft("targetText", event.target.value)
              }
              onScroll={(event) => syncHighlightScroll(event.currentTarget)}
              ref={targetTextareaRef}
              value={targetDraft}
            />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <Info label="源语言" value={row.sourceLang} />
          <Info label="目标语言" value={row.targetLang} />
          <Info label="位置" value={String(row.position)} />
          <Info label="重复项" value={row.duplicate ? "是" : "否"} />
        </div>

        <div className="mt-5">
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

      <Drawer
        direction="right"
        onOpenChange={setHistoryOpen}
        open={historyOpen}
      >
        <DrawerContent
          className="w-[min(520px,50vw)] gap-0 bg-slate-50 sm:max-w-[520px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            historyButtonRef.current?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            historyCloseButtonRef.current?.focus();
          }}
        >
          <DrawerHeader className="flex h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-0 text-left">
            <div>
              <DrawerTitle className="text-sm font-semibold text-slate-900">
                修改记录
              </DrawerTitle>
            </div>
            <DrawerClose asChild>
              <Button
                aria-label="关闭修改记录"
                className="size-8 text-slate-500"
                ref={historyCloseButtonRef}
                size="icon"
                title="关闭修改记录"
                type="button"
                variant="ghost"
              >
                <X size={16} />
              </Button>
            </DrawerClose>
          </DrawerHeader>
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
                        <Button
                          className="h-7 shrink-0 px-2 text-xs text-slate-700"
                          disabled={interactionLocked || !onRestoreHistory}
                          onClick={() => void restoreHistory(entry)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          恢复此版本
                        </Button>
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
                    <Button
                      className="h-7 shrink-0 px-2 text-xs text-slate-700"
                      disabled={interactionLocked || !onRestoreHistory}
                      onClick={() => void restoreHistory(importedSnapshot)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      恢复此版本
                    </Button>
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
        </DrawerContent>
      </Drawer>

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
        <Button
          className="h-9 min-w-0 gap-2"
          disabled={interactionLocked}
          onClick={() => void saveExplicitly()}
          type="button"
          size="sm"
        >
          <Save className="shrink-0" size={14} />
          <span className="truncate">立即保存</span>
        </Button>
        <Button
          className="h-9 min-w-0 gap-2 px-2"
          disabled={interactionLocked || !canNext}
          onClick={() => void saveAndNext()}
          type="button"
          size="sm"
        >
          <Save className="shrink-0" size={14} />
          <span className="truncate">保存并下一条</span>
        </Button>
      </div>
    </aside>
  );
});

function HighlightedText({
  activeMatch,
  matches,
  text,
}: {
  activeMatch: number;
  matches: TextMatch[];
  text: string;
}) {
  if (matches.length === 0) {
    return text;
  }

  let cursor = 0;
  return (
    <>
      {matches.map((match, index) => {
        const before = text.slice(cursor, match.start);
        const value = text.slice(match.start, match.end);
        cursor = match.end;
        return (
          <Fragment key={`${match.start}-${match.end}`}>
            {before}
            <mark
              className={
                index === activeMatch
                  ? "bg-orange-300 text-transparent"
                  : "bg-yellow-200 text-transparent"
              }
              data-testid="find-highlight"
            >
              {index === activeMatch ? (
                <span data-testid="find-highlight-active">{value}</span>
              ) : (
                value
              )}
            </mark>
          </Fragment>
        );
      })}
      {text.slice(cursor)}
    </>
  );
}

function findMatchRanges(text: string, query: string, caseSensitive: boolean) {
  if (!query) {
    return [];
  }
  return Array.from(
    text.matchAll(createLiteralPattern(query, caseSensitive)),
    (match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
}

function replaceLiteralAll(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
) {
  if (!query) {
    return text;
  }
  return text.replace(
    createLiteralPattern(query, caseSensitive),
    () => replacement,
  );
}

function createLiteralPattern(query: string, caseSensitive: boolean) {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escapedQuery, caseSensitive ? "gu" : "giu");
}

function capitalizeFirstEnglishLetter(text: string) {
  const match = /[A-Za-z]/.exec(text);
  if (!match) {
    return text;
  }
  const capitalized = match[0].toUpperCase();
  if (capitalized === match[0]) {
    return text;
  }
  return `${text.slice(0, match.index)}${capitalized}${text.slice(match.index + 1)}`;
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
    <Button
      aria-label={label}
      className="size-9 shrink-0 text-slate-700"
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef}
      title={title}
      size="icon"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            className="size-9 text-slate-700"
            disabled={disabled}
            onClick={onClick}
            size="icon"
            type="button"
            variant="ghost"
          >
            {children}
            <span className="sr-only">
              {label} {shortcut}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {label} {shortcut}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
