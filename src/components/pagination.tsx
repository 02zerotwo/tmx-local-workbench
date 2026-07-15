"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
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
      <label className="flex items-center gap-2" htmlFor="page-size">
        每页
        <select
          className="h-8 rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          id="page-size"
          onChange={(event) => onPageSizeChange(Number(event.target.value) as ProjectPageSize)}
          value={pageSize}
        >
          {PROJECT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
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
    <button
      aria-label={label}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
