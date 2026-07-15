import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TranslationUnitRow } from "@/lib/desktop-types";
import { TranslationTable } from "./translation-table";

function row(overrides: Partial<TranslationUnitRow> = {}): TranslationUnitRow {
  return {
    rowId: "row-1",
    projectId: "project-1",
    id: "unit-1",
    position: 1,
    sourceLang: "zh-CN",
    sourceText: "启动设备",
    originalSourceText: "启动设备",
    targetLang: "en-US",
    targetText: "Start the device",
    originalTargetText: "Start the device",
    changed: false,
    duplicate: false,
    metadata: {},
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("TranslationTable", () => {
  it("renders a semantic shadcn table and selects rows with the pointer", () => {
    const onSelect = vi.fn();
    render(
      <TranslationTable
        loading={false}
        onSelect={onSelect}
        resetKey="page-1"
        rows={[row()]}
        selectedRowId="row-1"
      />,
    );

    expect(screen.getByRole("table", { name: "翻译条目" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(({ textContent }) => textContent)).toEqual([
      "序号",
      "源语言",
      "源文本",
      "目标语言",
      "目标文本",
      "状态",
    ]);
    const tableRow = screen.getByRole("row", { name: "选择 unit-1" });
    expect(tableRow).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tableRow);
    expect(onSelect).toHaveBeenCalledWith(row());
  });

  it("selects a translation row with Enter or Space", () => {
    const selected = row();
    const onSelect = vi.fn();
    render(
      <TranslationTable
        loading={false}
        onSelect={onSelect}
        resetKey="page-1"
        rows={[selected]}
        selectedRowId=""
      />,
    );

    const tableRow = screen.getByRole("row", { name: "选择 unit-1" });
    fireEvent.keyDown(tableRow, { key: "Enter" });
    fireEvent.keyDown(tableRow, { key: " " });
    expect(onSelect).toHaveBeenNthCalledWith(1, selected);
    expect(onSelect).toHaveBeenNthCalledWith(2, selected);
  });

  it("keeps empty and loading states inside the table body", () => {
    const { rerender } = render(
      <TranslationTable
        loading
        onSelect={vi.fn()}
        resetKey="loading"
        rows={[]}
        selectedRowId=""
      />,
    );
    expect(screen.getByRole("cell", { name: "正在读取翻译数据..." })).toBeInTheDocument();

    rerender(
      <TranslationTable
        loading={false}
        onSelect={vi.fn()}
        resetKey="empty"
        rows={[]}
        selectedRowId=""
      />,
    );
    expect(screen.getByRole("cell", { name: "没有符合条件的翻译行" })).toBeInTheDocument();
  });

  it("virtualizes translation pages larger than fifty rows", () => {
    const rows = Array.from({ length: 60 }, (_, index) => row({
      rowId: `row-${index + 1}`,
      id: `unit-${index + 1}`,
      position: index + 1,
    }));
    render(
      <TranslationTable
        loading={false}
        onSelect={vi.fn()}
        resetKey="page-1"
        rows={rows}
        selectedRowId=""
      />,
    );

    expect(screen.getByRole("row", { name: "选择 unit-1" })).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeLessThan(61);
  });
});
