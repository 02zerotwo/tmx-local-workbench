import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AiSessionRecord } from "@/lib/desktop-types";
import { SessionHistoryDrawer } from "./session-history-drawer";

const session: AiSessionRecord = {
  id: "session-1",
  projectId: "project-1",
  title: "术语检查",
  status: "active",
  pinned: false,
  summary: "",
  model: "deepseek-v4-flash",
  createdAt: "2026-07-17T05:00:00.000Z",
  updatedAt: "2026-07-17T05:00:00.000Z",
};

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});

function renderDrawer(
  onRename = vi.fn().mockResolvedValue(true),
  onDelete = vi.fn().mockResolvedValue(true),
) {
  render(
    <SessionHistoryDrawer
      activeSessionId={session.id}
      loading={false}
      onCreate={() => undefined}
      onDelete={onDelete}
      onOpenChange={() => undefined}
      onRename={onRename}
      onSelect={() => undefined}
      open
      sessions={[session]}
    />,
  );
  return { onRename, onDelete };
}

describe("SessionHistoryDrawer", () => {
  it("renames a session from its row action menu", async () => {
    const { onRename } = renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "更多：术语检查" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("会话名称"), {
      target: { value: "项目术语复查" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith("session-1", "项目术语复查");
    });
  });

  it("asks for confirmation before deleting a session", async () => {
    const { onDelete } = renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "更多：术语检查" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("删除“术语检查”");
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("session-1");
    });
  });
});
