import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { AiCompactToolbar } from "./ai-compact-toolbar";

describe("AiCompactToolbar", () => {
  it("keeps high-priority mode and new-session actions in one toolbar", () => {
    const onTabChange = vi.fn();
    const onCreateSession = vi.fn();
    const onOpenHistory = vi.fn();
    const onOpenEditor = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <Tabs onValueChange={onTabChange} value="conversation">
        <AiCompactToolbar
          activeTab="conversation"
          onCreateSession={onCreateSession}
          onOpenHistory={onOpenHistory}
          onOpenEditor={onOpenEditor}
          onOpenSettings={onOpenSettings}
          sessionTitle="术语检查"
        />
      </Tabs>,
    );

    expect(screen.getByRole("toolbar", { name: "AI 工具栏" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "会话" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "审查" })).toBeVisible();
    expect(screen.getByText("术语检查")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));
    fireEvent.click(screen.getByRole("button", { name: "历史会话" }));
    fireEvent.click(screen.getByRole("button", { name: "Key 设置" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑模式" }));

    expect(onCreateSession).toHaveBeenCalledTimes(1);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "更多工具" })).toHaveLength(2);
  });

  it("omits conversation-only actions in audit mode", () => {
    render(
      <Tabs value="audit">
        <AiCompactToolbar
          activeTab="audit"
          onOpenEditor={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </Tabs>,
    );

    expect(screen.queryByRole("button", { name: "新建会话" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史会话" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Key 设置" })).toBeVisible();
  });
});
