import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("uses shared shadcn controls and changes page", () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
        page={2}
        pageCount={4}
        pageSize={100}
        total={350}
      />,
    );

    expect(document.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
