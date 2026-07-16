import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TmxDesktopApi } from "@/lib/desktop-types";
import { AiModePanel } from "./ai-mode-panel";

describe("AiModePanel", () => {
  it("requires and verifies a DeepSeek key before showing Agent tools", async () => {
    const saveDeepSeekKey = vi.fn().mockResolvedValue({
      configured: true,
      maskedKey: "••••5678",
      model: "deepseek-v4-flash",
      verifiedAt: "2026-07-15T06:00:00.000Z",
    });
    const api = {
      getAiSettings: vi.fn().mockResolvedValue({
        configured: false,
        maskedKey: null,
        model: "deepseek-v4-flash",
        verifiedAt: null,
      }),
      saveDeepSeekKey,
      verifyDeepSeekConnection: vi.fn(),
      deleteDeepSeekKey: vi.fn(),
      queryProject: vi.fn().mockResolvedValue({
        rows: [], total: 20, page: 1, pageSize: 100, pageCount: 1,
      }),
      listAiSessions: vi.fn().mockResolvedValue([]),
      createAiSession: vi.fn(),
      listAiMessages: vi.fn().mockResolvedValue([]),
      sendAiMessage: vi.fn(),
      stopAiMessage: vi.fn(),
      retryAiMessage: vi.fn(),
      onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
      listAiAuditJobs: vi.fn().mockResolvedValue([]),
      startAiAudit: vi.fn(),
      pauseAiAudit: vi.fn(),
      resumeAiAudit: vi.fn(),
      listAiAuditFindings: vi.fn().mockResolvedValue([]),
      decideAiAuditFinding: vi.fn(),
      acceptAllAiAuditFindings: vi.fn(),
      applyAiAudit: vi.fn(),
      onAiAuditEvent: vi.fn().mockReturnValue(() => undefined),
    } as Pick<
      TmxDesktopApi,
      | "getAiSettings"
      | "saveDeepSeekKey"
      | "verifyDeepSeekConnection"
      | "deleteDeepSeekKey"
      | "queryProject"
      | "listAiSessions"
      | "createAiSession"
      | "listAiMessages"
      | "sendAiMessage"
      | "stopAiMessage"
      | "retryAiMessage"
      | "onAiAgentEvent"
      | "listAiAuditJobs"
      | "startAiAudit"
      | "pauseAiAudit"
      | "resumeAiAudit"
      | "listAiAuditFindings"
      | "decideAiAuditFinding"
      | "acceptAllAiAuditFindings"
      | "applyAiAudit"
      | "onAiAuditEvent"
    >;

    render(
      <AiModePanel
        api={api}
        onApplied={() => undefined}
        projectId="project-1"
        targetLanguages={["en-US", "de-DE"]}
      />,
    );

    expect(await screen.findByText("配置 DeepSeek API Key")).toBeVisible();
    fireEvent.change(screen.getByLabelText("DeepSeek API Key"), {
      target: { value: "sk-deepseek-5678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并验证" }));

    await waitFor(() => expect(saveDeepSeekKey).toHaveBeenCalledWith("sk-deepseek-5678"));
    expect(await screen.findByRole("tab", { name: "会话" })).toBeVisible();
  });

  it("confirms API key removal with a shadcn alert dialog", async () => {
    const deleteDeepSeekKey = vi.fn().mockResolvedValue({
      configured: false,
      maskedKey: null,
      model: "deepseek-v4-flash",
      verifiedAt: null,
    });
    const api = {
      getAiSettings: vi.fn().mockResolvedValue({
        configured: true,
        maskedKey: "••••5678",
        model: "deepseek-v4-flash",
        verifiedAt: "2026-07-15T06:00:00.000Z",
      }),
      saveDeepSeekKey: vi.fn(),
      verifyDeepSeekConnection: vi.fn(),
      deleteDeepSeekKey,
      queryProject: vi.fn().mockResolvedValue({
        rows: [], total: 20, page: 1, pageSize: 100, pageCount: 1,
      }),
      listAiSessions: vi.fn().mockResolvedValue([]),
      createAiSession: vi.fn(),
      listAiMessages: vi.fn().mockResolvedValue([]),
      sendAiMessage: vi.fn(),
      stopAiMessage: vi.fn(),
      retryAiMessage: vi.fn(),
      onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
      listAiAuditJobs: vi.fn().mockResolvedValue([]),
      startAiAudit: vi.fn(),
      pauseAiAudit: vi.fn(),
      resumeAiAudit: vi.fn(),
      listAiAuditFindings: vi.fn().mockResolvedValue([]),
      decideAiAuditFinding: vi.fn(),
      acceptAllAiAuditFindings: vi.fn(),
      applyAiAudit: vi.fn(),
      onAiAuditEvent: vi.fn().mockReturnValue(() => undefined),
    } as Pick<TmxDesktopApi,
      | "getAiSettings" | "saveDeepSeekKey" | "verifyDeepSeekConnection"
      | "deleteDeepSeekKey" | "queryProject" | "listAiSessions"
      | "createAiSession" | "listAiMessages" | "sendAiMessage"
      | "stopAiMessage" | "retryAiMessage" | "onAiAgentEvent"
      | "listAiAuditJobs" | "startAiAudit" | "pauseAiAudit"
      | "resumeAiAudit" | "listAiAuditFindings" | "decideAiAuditFinding"
      | "acceptAllAiAuditFindings" | "applyAiAudit" | "onAiAuditEvent"
    >;

    render(
      <AiModePanel
        api={api}
        onApplied={() => undefined}
        projectId="project-1"
        targetLanguages={["en-US"]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除 API Key" }));
    expect(deleteDeepSeekKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("删除 DeepSeek API Key");

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteDeepSeekKey).toHaveBeenCalledTimes(1));
  });
});
