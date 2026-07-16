"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_PAGE_SIZES, type ProjectPageSize } from "@/lib/desktop-types";

type PaginationProps = {
  page: number;
  pageCount: number;
  pageSize: ProjectPageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ProjectPageSize) => void;
};

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(total, page * pageSize);

  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 text-sm text-slate-600" data-testid="pagination-footer">
      <span className="mr-auto tabular-nums">
        {total.toLocaleString()} 条，第 {firstVisible.toLocaleString()}-{lastVisible.toLocaleString()} 条
      </span>
      <div className="flex items-center gap-2">
        <span id="page-size-label">每页</span>
        <Select
          onValueChange={(value) => onPageSizeChange(Number(value) as ProjectPageSize)}
          value={String(pageSize)}
        >
          <SelectTrigger aria-labelledby="page-size-label" className="h-8 w-20 rounded-md bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="min-w-24 text-center tabular-nums">第 {page} / {pageCount} 页</span>
      <PageButton disabled={page <= 1} label="第一页" onClick={() => onPageChange(1)}>
        <ChevronFirst size={16} />
      </PageButton>
      <PageButton disabled={page <= 1} label="上一页" onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={16} />
      </PageButton>
      <PageButton disabled={page >= pageCount} label="下一页" onClick={() => onPageChange(page + 1)}>
        <ChevronRight size={16} />
      </PageButton>
      <PageButton disabled={page >= pageCount} label="最后一页" onClick={() => onPageChange(pageCount)}>
        <ChevronLast size={16} />
      </PageButton>
    </footer>
  );
}

function PageButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="text-slate-700 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
