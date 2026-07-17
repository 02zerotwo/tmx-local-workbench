import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiKeySettingsDialog } from "./ai-key-settings-dialog";

describe("AiKeySettingsDialog", () => {
  it("verifies, replaces, and requests deletion of the configured key", async () => {
    const onVerify = vi.fn();
    const onReplace = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn();

    render(
      <AiKeySettingsDialog
        busy={false}
        error=""
        maskedKey="••••5678"
        onDelete={onDelete}
        onOpenChange={() => undefined}
        onReplace={onReplace}
        onVerify={onVerify}
        open
        verifiedAt="2026-07-15T06:00:00.000Z"
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("DeepSeek API Key 设置");
    expect(screen.getByText("••••5678")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "验证连接" }));
    expect(onVerify).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("替换 DeepSeek API Key"), {
      target: { value: "sk-deepseek-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "替换并验证" }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledWith("sk-deepseek-new"));

    fireEvent.click(screen.getByRole("button", { name: "删除 API Key" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
