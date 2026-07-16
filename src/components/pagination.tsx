"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
    <footer
      className="flex h-14 shrink-0 items-center gap-4 border-t border-border bg-background px-4 text-sm"
      data-testid="pagination-footer"
    >
      <span className="mr-auto truncate text-muted-foreground">
        共{" "}
        <strong className="font-medium text-foreground">
          {total.toLocaleString()}
        </strong>{" "}
        条
        <span className="hidden tabular-nums sm:inline">
          ，第 {firstVisible.toLocaleString()}-{lastVisible.toLocaleString()} 条
        </span>
      </span>
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-muted-foreground" id="page-size-label">
          每页
        </span>
        <Select
          onValueChange={(value) =>
            onPageSizeChange(Number(value) as ProjectPageSize)
          }
          value={String(pageSize)}
        >
          <SelectTrigger
            aria-labelledby="page-size-label"
            className="h-8 w-20 bg-background"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="min-w-20 shrink-0 text-center text-sm font-medium tabular-nums text-foreground">
        {page} / {pageCount}
      </span>
      <ButtonGroup aria-label="翻页">
        <PageButton
          disabled={page <= 1}
          label="第一页"
          onClick={() => onPageChange(1)}
        >
          <ChevronFirst size={16} />
        </PageButton>
        <PageButton
          disabled={page <= 1}
          label="上一页"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </PageButton>
        <PageButton
          disabled={page >= pageCount}
          label="下一页"
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </PageButton>
        <PageButton
          disabled={page >= pageCount}
          label="最后一页"
          onClick={() => onPageChange(pageCount)}
        >
          <ChevronLast size={16} />
        </PageButton>
      </ButtonGroup>
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
      className="size-8 text-muted-foreground disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}
