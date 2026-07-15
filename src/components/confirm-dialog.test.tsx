import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("uses the shared alert dialog and confirms the action", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        confirmLabel="删除"
        description="删除后无法恢复"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
        title="删除项目"
        tone="danger"
      />,
    );

    expect(document.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
