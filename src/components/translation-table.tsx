"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { TranslationUnitRow } from "@/lib/desktop-types";

type TranslationTableProps = {
  rows: TranslationUnitRow[];
  selectedRowId: string;
  loading: boolean;
  resetKey: string;
  onSelect: (row: TranslationUnitRow) => void;
};

const ROW_HEIGHT = 68;

export function TranslationTable({
  rows,
  selectedRowId,
  loading,
  resetKey,
  onSelect,
}: TranslationTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    enabled: rows.length > 50,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    initialRect: { width: 900, height: 600 },
    overscan: 10,
  });
  const visibleRows = rows.length > 50
    ? virtualizer.getVirtualItems()
    : rows.map((_, index) => ({
      index,
      key: index,
      lane: 0,
      size: ROW_HEIGHT,
      start: index * ROW_HEIGHT,
      end: (index + 1) * ROW_HEIGHT,
    }));
  const totalHeight = rows.length > 50
    ? virtualizer.getTotalSize()
    : rows.length * ROW_HEIGHT;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="grid h-10 shrink-0 grid-cols-[76px_86px_minmax(220px,1fr)_86px_minmax(220px,1fr)_86px] items-center border-b border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600">
        <span>序号</span>
        <span>源语言</span>
        <span>源文本</span>
        <span>目标语言</span>
        <span>目标文本</span>
        <span>状态</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto scrollbar-thin" ref={scrollRef}>
        {loading && rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">正在读取翻译数据...</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">没有符合条件的翻译行</div>
        ) : (
          <div className="relative w-full" style={{ height: totalHeight }}>
            {visibleRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const selected = row.rowId === selectedRowId;
              const empty = row.targetText.trim().length === 0;
              return (
                <button
                  aria-label={`选择 ${row.id}`}
                  className={selected
                    ? "absolute left-0 grid w-full cursor-pointer grid-cols-[76px_86px_minmax(220px,1fr)_86px_minmax(220px,1fr)_86px] items-center border-b border-blue-200 bg-blue-50 px-3 text-left text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                    : "absolute left-0 grid w-full cursor-pointer grid-cols-[76px_86px_minmax(220px,1fr)_86px_minmax(220px,1fr)_86px] items-center border-b border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-inset focus:ring-blue-500"}
                  key={row.rowId}
                  onClick={() => onSelect(row)}
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  type="button"
                >
                  <span className="truncate tabular-nums text-slate-500">{row.position}</span>
                  <span className="truncate text-slate-600">{row.sourceLang}</span>
                  <span className="truncate pr-4 text-slate-900" title={row.sourceText}>{row.sourceText}</span>
                  <span className="truncate text-slate-600">{row.targetLang}</span>
                  <span className={empty ? "truncate pr-4 italic text-red-600" : "truncate pr-4 text-slate-900"} title={row.targetText}>
                    {empty ? "空译文" : row.targetText}
                  </span>
                  <span>
                    {empty ? (
                      <span className="rounded bg-red-50 px-1.5 py-1 text-[11px] font-medium text-red-700">空译文</span>
                    ) : row.changed ? (
                      <span className="rounded bg-amber-50 px-1.5 py-1 text-[11px] font-medium text-amber-700">已修改</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-medium text-slate-600">原始</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {loading && rows.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-blue-100">
            <div className="h-full w-1/3 animate-pulse bg-blue-600" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
