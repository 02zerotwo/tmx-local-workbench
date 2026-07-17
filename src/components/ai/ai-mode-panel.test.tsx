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
      renameAiSession: vi.fn(),
      deleteAiSession: vi.fn(),
      listAiMessages: vi.fn().mockResolvedValue([]),
      sendAiMessage: vi.fn(),
      stopAiMessage: vi.fn(),
      retryAiMessage: vi.fn(),
      onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
      listAiAgentRevisions: vi.fn().mockResolvedValue([]),
      updateAiAgentRevision: vi.fn(),
      applyAiAgentRevisions: vi.fn().mockResolvedValue({ applied: 0, stale: 0, missing: 0 }),
      ignoreAiAgentRevision: vi.fn(),
      listAiAuditJobs: vi.fn().mockResolvedValue([]),
      startAiAudit: vi.fn(),
      pauseAiAudit: vi.fn(),
      resumeAiAudit: vi.fn(),
      listAiAuditFindings: vi.fn().mockResolvedValue([]),
      decideAiAuditFinding: vi.fn(),
      acceptAllAiAuditFindings: vi.fn(),
      applyAiAudit: vi.fn(),
      getAiAuditDefaults: vi.fn().mockResolvedValue({
        customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 8,
      }),
      saveAiAuditDefaults: vi.fn(),
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
      | "renameAiSession"
      | "deleteAiSession"
      | "listAiMessages"
      | "sendAiMessage"
      | "stopAiMessage"
      | "retryAiMessage"
      | "onAiAgentEvent"
      | "listAiAgentRevisions"
      | "updateAiAgentRevision"
      | "applyAiAgentRevisions"
      | "ignoreAiAgentRevision"
      | "listAiAuditJobs"
      | "startAiAudit"
      | "pauseAiAudit"
      | "resumeAiAudit"
      | "listAiAuditFindings"
      | "decideAiAuditFinding"
      | "acceptAllAiAuditFindings"
      | "applyAiAudit"
      | "getAiAuditDefaults"
      | "saveAiAuditDefaults"
      | "onAiAuditEvent"
    >;

    render(
      <AiModePanel
        api={api}
        onApplied={() => undefined}
        onOpenEditor={vi.fn()}
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

  it("hides the Agent name and manages the key from the settings dialog", async () => {
    const deleteDeepSeekKey = vi.fn().mockResolvedValue({
      configured: false,
      maskedKey: null,
      model: "deepseek-v4-flash",
      verifiedAt: null,
    });
    const saveDeepSeekKey = vi.fn().mockResolvedValue({
      configured: true,
      maskedKey: "••••9999",
      model: "deepseek-v4-flash",
      verifiedAt: "2026-07-17T06:00:00.000Z",
    });
    const verifyDeepSeekConnection = vi.fn().mockResolvedValue({
      configured: true,
      maskedKey: "••••5678",
      model: "deepseek-v4-flash",
      verifiedAt: "2026-07-17T05:00:00.000Z",
    });
    const api = {
      getAiSettings: vi.fn().mockResolvedValue({
        configured: true,
        maskedKey: "••••5678",
        model: "deepseek-v4-flash",
        verifiedAt: "2026-07-15T06:00:00.000Z",
      }),
      saveDeepSeekKey,
      verifyDeepSeekConnection,
      deleteDeepSeekKey,
      queryProject: vi.fn().mockResolvedValue({
        rows: [], total: 20, page: 1, pageSize: 100, pageCount: 1,
      }),
      listAiSessions: vi.fn().mockResolvedValue([]),
      createAiSession: vi.fn(),
      renameAiSession: vi.fn(),
      deleteAiSession: vi.fn(),
      listAiMessages: vi.fn().mockResolvedValue([]),
      sendAiMessage: vi.fn(),
      stopAiMessage: vi.fn(),
      retryAiMessage: vi.fn(),
      onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
      listAiAgentRevisions: vi.fn().mockResolvedValue([]),
      updateAiAgentRevision: vi.fn(),
      applyAiAgentRevisions: vi.fn().mockResolvedValue({ applied: 0, stale: 0, missing: 0 }),
      ignoreAiAgentRevision: vi.fn(),
      listAiAuditJobs: vi.fn().mockResolvedValue([]),
      startAiAudit: vi.fn(),
      pauseAiAudit: vi.fn(),
      resumeAiAudit: vi.fn(),
      listAiAuditFindings: vi.fn().mockResolvedValue([]),
      decideAiAuditFinding: vi.fn(),
      acceptAllAiAuditFindings: vi.fn(),
      applyAiAudit: vi.fn(),
      getAiAuditDefaults: vi.fn().mockResolvedValue({
        customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 8,
      }),
      saveAiAuditDefaults: vi.fn(),
      onAiAuditEvent: vi.fn().mockReturnValue(() => undefined),
    } as Pick<TmxDesktopApi,
      | "getAiSettings" | "saveDeepSeekKey" | "verifyDeepSeekConnection"
      | "deleteDeepSeekKey" | "queryProject" | "listAiSessions"
      | "createAiSession" | "renameAiSession" | "deleteAiSession"
      | "listAiMessages" | "sendAiMessage"
      | "stopAiMessage" | "retryAiMessage" | "onAiAgentEvent"
      | "listAiAgentRevisions" | "updateAiAgentRevision"
      | "applyAiAgentRevisions" | "ignoreAiAgentRevision"
      | "listAiAuditJobs" | "startAiAudit" | "pauseAiAudit"
      | "resumeAiAudit" | "listAiAuditFindings" | "decideAiAuditFinding"
      | "acceptAllAiAuditFindings" | "applyAiAudit"
      | "getAiAuditDefaults" | "saveAiAuditDefaults" | "onAiAuditEvent"
    >;

    render(
      <AiModePanel
        api={api}
        onApplied={() => undefined}
        onOpenEditor={vi.fn()}
        projectId="project-1"
        targetLanguages={["en-US"]}
      />,
    );

    expect(await screen.findByRole("tab", { name: "会话" })).toBeVisible();
    expect(screen.queryByText("DeepSeek Agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Key 设置" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("DeepSeek API Key 设置");
    expect(screen.getByText("••••5678")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "验证连接" }));
    await waitFor(() => expect(verifyDeepSeekConnection).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("替换 DeepSeek API Key"), {
      target: { value: "sk-deepseek-9999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "替换并验证" }));
    await waitFor(() => expect(saveDeepSeekKey).toHaveBeenCalledWith("sk-deepseek-9999"));

    fireEvent.click(screen.getByRole("button", { name: "删除 API Key" }));
    expect(deleteDeepSeekKey).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("删除 DeepSeek API Key");

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteDeepSeekKey).toHaveBeenCalledTimes(1));
  });
});
