"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { TranslationUnitRow } from "@/lib/desktop-types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TranslationTableProps = {
  rows: TranslationUnitRow[];
  selectedRowId: string;
  loading: boolean;
  resetKey: string;
  onSelect: (row: TranslationUnitRow) => void;
};

const ROW_HEIGHT = 68;
const INITIAL_VIRTUAL_ROWS = 20;
const TABLE_COLUMNS = "grid-cols-[76px_86px_minmax(220px,1fr)_86px_minmax(220px,1fr)_86px]";

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
  const virtualRows = virtualizer.getVirtualItems();
  const visibleRows = rows.length > 50 && virtualRows.length > 0
    ? virtualRows
    : rows.slice(0, rows.length > 50 ? INITIAL_VIRTUAL_ROWS : rows.length).map((_, index) => ({
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
      <div className="relative min-h-0 flex-1 overflow-auto scrollbar-thin" ref={scrollRef}>
        <Table
          aria-label="翻译条目"
          className="grid min-w-[900px] border-collapse"
          containerClassName="min-h-full overflow-visible"
        >
          <TableHeader className="sticky top-0 z-10 block bg-slate-100">
            <TableRow className={`grid h-10 ${TABLE_COLUMNS} items-center border-slate-200 hover:bg-slate-100`}>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">序号</TableHead>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">源语言</TableHead>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">源文本</TableHead>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">目标语言</TableHead>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">目标文本</TableHead>
              <TableHead className="flex h-10 items-center px-3 text-xs text-slate-600">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={rows.length > 0 ? "relative block" : "block"}
            style={rows.length > 0 ? { height: totalHeight } : undefined}
          >
            {loading && rows.length === 0 ? (
              <EmptyTableRow message="正在读取翻译数据..." />
            ) : rows.length === 0 ? (
              <EmptyTableRow message="没有符合条件的翻译行" />
            ) : visibleRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const selected = row.rowId === selectedRowId;
              const empty = row.targetText.trim().length === 0;
              return (
                <TableRow
                  aria-label={`选择 ${row.id}`}
                  aria-selected={selected}
                  className={`absolute left-0 grid w-full ${TABLE_COLUMNS} cursor-pointer items-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${selected
                    ? "border-blue-200 bg-blue-50 hover:bg-blue-50 data-[state=selected]:bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  data-state={selected ? "selected" : undefined}
                  key={row.rowId}
                  onClick={() => onSelect(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row);
                    }
                  }}
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  tabIndex={0}
                >
                  <TableCell className="min-w-0 truncate px-3 tabular-nums text-slate-500">{row.position}</TableCell>
                  <TableCell className="min-w-0 truncate px-3 text-slate-600">{row.sourceLang}</TableCell>
                  <TableCell className="min-w-0 truncate px-3 pr-4 text-slate-900" title={row.sourceText}>{row.sourceText}</TableCell>
                  <TableCell className="min-w-0 truncate px-3 text-slate-600">{row.targetLang}</TableCell>
                  <TableCell
                    className={empty
                      ? "min-w-0 truncate px-3 pr-4 italic text-red-600"
                      : "min-w-0 truncate px-3 pr-4 text-slate-900"}
                    title={row.targetText}
                  >
                    {empty ? "空译文" : row.targetText}
                  </TableCell>
                  <TableCell className="min-w-0 px-3">
                    {empty ? (
                      <Badge className="bg-red-50 text-red-700" variant="secondary">空译文</Badge>
                    ) : row.changed ? (
                      <Badge className="bg-amber-50 text-amber-700" variant="secondary">已修改</Badge>
                    ) : (
                      <Badge variant="secondary">原始</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {loading && rows.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-blue-100">
            <div className="h-full w-1/3 animate-pulse bg-blue-600" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyTableRow({ message }: { message: string }) {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell className="h-60 text-center text-sm text-slate-500" colSpan={6}>
        {message}
      </TableCell>
    </TableRow>
  );
}
