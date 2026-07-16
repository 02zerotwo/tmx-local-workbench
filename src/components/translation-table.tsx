"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  PencilLine,
  SearchX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { TranslationUnitRow } from "@/lib/desktop-types";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
const TABLE_COLUMNS =
  "grid-cols-[72px_92px_minmax(220px,1fr)_92px_minmax(220px,1fr)_104px]";

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
  const visibleRows =
    rows.length > 50 && virtualRows.length > 0
      ? virtualRows
      : rows
          .slice(0, rows.length > 50 ? INITIAL_VIRTUAL_ROWS : rows.length)
          .map((_, index) => ({
            index,
            key: index,
            lane: 0,
            size: ROW_HEIGHT,
            start: index * ROW_HEIGHT,
            end: (index + 1) * ROW_HEIGHT,
          }));
  const totalHeight =
    rows.length > 50 ? virtualizer.getTotalSize() : rows.length * ROW_HEIGHT;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        className="relative min-h-0 flex-1 overflow-auto scrollbar-thin"
        ref={scrollRef}
      >
        <Table
          aria-label="翻译条目"
          className="grid min-w-[900px] border-collapse"
          containerClassName="min-h-full overflow-visible"
        >
          <TableHeader className="sticky top-0 z-10 block bg-muted/70 backdrop-blur-sm">
            <TableRow
              className={`grid h-10 ${TABLE_COLUMNS} items-center border-border hover:bg-transparent`}
            >
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                序号
              </TableHead>
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                源语言
              </TableHead>
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                源文本
              </TableHead>
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                目标语言
              </TableHead>
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                目标文本
              </TableHead>
              <TableHead className="flex h-10 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                状态
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={rows.length > 0 ? "relative block" : "block"}
            style={rows.length > 0 ? { height: totalHeight } : undefined}
          >
            {loading && rows.length === 0 ? (
              <EmptyTableRow loading message="正在读取翻译数据..." />
            ) : rows.length === 0 ? (
              <EmptyTableRow message="没有符合条件的翻译行" />
            ) : (
              visibleRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                const selected = row.rowId === selectedRowId;
                const empty = row.targetText.trim().length === 0;
                return (
                  <TableRow
                    aria-label={`选择 ${row.id}`}
                    aria-selected={selected}
                    className={`absolute left-0 grid w-full ${TABLE_COLUMNS} cursor-pointer items-center border-border text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                      selected
                        ? "bg-primary/5 ring-1 ring-inset ring-primary/25 hover:bg-primary/5 data-[state=selected]:bg-primary/5"
                        : "bg-background hover:bg-muted/50"
                    }`}
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
                    <TableCell className="min-w-0 truncate px-3 tabular-nums text-muted-foreground">
                      {row.position}
                    </TableCell>
                    <TableCell className="flex min-w-0 items-center px-3">
                      <Badge
                        className="font-normal text-muted-foreground"
                        variant="outline"
                      >
                        {row.sourceLang}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="min-w-0 truncate px-3 pr-4 text-foreground"
                      title={row.sourceText}
                    >
                      {row.sourceText}
                    </TableCell>
                    <TableCell className="flex min-w-0 items-center px-3">
                      <Badge
                        className="font-normal text-muted-foreground"
                        variant="outline"
                      >
                        {row.targetLang}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        empty
                          ? "min-w-0 truncate px-3 pr-4 italic text-destructive"
                          : "min-w-0 truncate px-3 pr-4 text-foreground"
                      }
                      title={row.targetText}
                    >
                      {empty ? "空译文" : row.targetText}
                    </TableCell>
                    <TableCell className="flex min-w-0 items-center px-3">
                      {empty ? (
                        <Badge
                          className="gap-1 border-destructive/20 bg-destructive/10 text-destructive"
                          variant="outline"
                        >
                          <CircleAlert />
                          空译文
                        </Badge>
                      ) : row.changed ? (
                        <Badge
                          className="gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-400"
                          variant="outline"
                        >
                          <PencilLine />
                          已修改
                        </Badge>
                      ) : (
                        <Badge
                          className="gap-1 text-muted-foreground"
                          variant="secondary"
                        >
                          <CheckCircle2 />
                          原始
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {loading && rows.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyTableRow({
  loading,
  message,
}: {
  loading?: boolean;
  message: string;
}) {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell className="p-0" colSpan={6}>
        <Empty className="absolute inset-0 rounded-none border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {loading ? <Loader2 className="animate-spin" /> : <SearchX />}
            </EmptyMedia>
            <EmptyTitle className="text-sm font-medium">{message}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  );
}
