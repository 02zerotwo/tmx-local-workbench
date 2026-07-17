import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AiAgentEvent,
  AiAgentRevisionRecord,
  AiMessageRecord,
  AiSessionRecord,
  TmxDesktopApi,
} from "@/lib/desktop-types";
import { AgentConversation } from "./agent-conversation";
import type { AgentConversationToolbarControls } from "./agent-conversation";

type AgentApi = Pick<
  TmxDesktopApi,
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
>;

const session: AiSessionRecord = {
  id: "session-1",
  projectId: "project-1",
  title: "术语检查",
  status: "active",
  pinned: false,
  summary: "",
  model: "deepseek-v4-flash",
  createdAt: "2026-07-15T06:00:00.000Z",
  updatedAt: "2026-07-15T06:10:00.000Z",
};

const secondSession: AiSessionRecord = {
  ...session,
  id: "session-2",
  title: "格式复查",
  createdAt: "2026-07-15T05:00:00.000Z",
  updatedAt: "2026-07-15T05:10:00.000Z",
};

function message(
  id: string,
  role: AiMessageRecord["role"],
  text: string,
): AiMessageRecord {
  return {
    id,
    sessionId: session.id,
    parentMessageId: null,
    branchId: "main",
    role,
    parts: [{ type: "text", text }],
    status: "complete",
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    createdAt: "2026-07-15T06:00:00.000Z",
    updatedAt: "2026-07-15T06:00:00.000Z",
  };
}

function createApi(overrides: Partial<AgentApi> = {}): AgentApi {
  return {
    listAiSessions: vi.fn().mockResolvedValue([session]),
    createAiSession: vi.fn().mockResolvedValue(session),
    renameAiSession: vi.fn().mockImplementation(async (_sessionId, title) => ({
      ...session,
      title,
    })),
    deleteAiSession: vi.fn().mockResolvedValue(true),
    listAiMessages: vi
      .fn()
      .mockResolvedValue([
        message("message-1", "user", "检查这个项目的术语"),
        message("message-2", "assistant", "发现 2 个术语不一致。"),
      ]),
    sendAiMessage: vi
      .fn()
      .mockResolvedValue(
        message("message-3", "assistant", "已完成当前范围检查。"),
      ),
    stopAiMessage: vi.fn().mockResolvedValue(true),
    retryAiMessage: vi
      .fn()
      .mockResolvedValue(message("message-retry", "assistant", "已重试")),
    onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
    listAiAgentRevisions: vi.fn().mockResolvedValue([]),
    updateAiAgentRevision: vi.fn(),
    applyAiAgentRevisions: vi
      .fn()
      .mockResolvedValue({ applied: 0, stale: 0, missing: 0 }),
    ignoreAiAgentRevision: vi.fn(),
    ...overrides,
  };
}

function testToolbar({
  sessionTitle,
  onCreateSession,
  onOpenHistory,
}: AgentConversationToolbarControls) {
  return (
    <div data-testid="conversation-toolbar">
      <span>{sessionTitle}</span>
      <button aria-label="打开历史" onClick={onOpenHistory} type="button" />
      <button aria-label="创建新会话" onClick={onCreateSession} type="button" />
    </div>
  );
}

describe("AgentConversation", () => {
  it("restores project sessions and persisted messages", async () => {
    const api = createApi();

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    expect(await screen.findByText("术语检查")).toBeVisible();
    expect(await screen.findByText("检查这个项目的术语")).toBeVisible();
    expect(screen.getByText("发现 2 个术语不一致。")).toBeVisible();
    expect(api.listAiMessages).toHaveBeenCalledWith("session-1", "main");
    expect(screen.getByTestId("conversation-toolbar")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "打开历史" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "创建新会话" }));
    expect(api.createAiSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("conversation-toolbar")).toHaveTextContent("新会话");
    fireEvent.click(screen.getByRole("button", { name: "打开历史" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭历史会话" }));
  });

  it("creates a blank session on first send using a truncated message title", async () => {
    const content = `${"检查这份译文".repeat(6)}  额外内容`;
    const title = `${Array.from(content.trim().replace(/\s+/gu, " "))
      .slice(0, 30)
      .join("")}…`;
    const createdSession = {
      ...session,
      id: "session-new",
      title,
    };
    const api = createApi({
      createAiSession: vi.fn().mockResolvedValue(createdSession),
      listAiMessages: vi.fn().mockResolvedValue([]),
      listAiSessions: vi
        .fn()
        .mockResolvedValueOnce([session])
        .mockResolvedValue([createdSession, session]),
    });

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    expect(await screen.findByText("术语检查")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "创建新会话" }));
    expect(api.createAiSession).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText(
      "向 DeepSeek 询问，或让它审查并修改当前项目...",
    );
    fireEvent.change(input, { target: { value: content } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(api.createAiSession).toHaveBeenCalledWith("project-1", title);
    });
    expect(api.sendAiMessage).toHaveBeenCalledWith(
      "session-new",
      "main",
      content.trim(),
    );
  });

  it("renames the active session and updates the toolbar title", async () => {
    const api = createApi();

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    expect(await screen.findByText("术语检查")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "打开历史" }));
    fireEvent.click(screen.getByRole("button", { name: "更多：术语检查" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("会话名称"), {
      target: { value: "项目术语复查" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => {
      expect(api.renameAiSession).toHaveBeenCalledWith(
        "session-1",
        "项目术语复查",
      );
    });
    expect(screen.getByTestId("conversation-toolbar")).toHaveTextContent(
      "项目术语复查",
    );
  });

  it("deletes the active session and selects the newest remaining session", async () => {
    const api = createApi({
      listAiSessions: vi.fn().mockResolvedValue([session, secondSession]),
      listAiMessages: vi.fn().mockResolvedValue([]),
    });

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    expect(await screen.findByText("术语检查")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "打开历史" }));
    fireEvent.click(screen.getByRole("button", { name: "更多：术语检查" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(api.deleteAiSession).toHaveBeenCalledWith("session-1");
    });
    await waitFor(() => {
      expect(screen.getByTestId("conversation-toolbar")).toHaveTextContent(
        "格式复查",
      );
    });
    expect(api.listAiMessages).toHaveBeenCalledWith("session-2", "main");
  });

  it("streams the active reply and reloads its saved checkpoint", async () => {
    let listener: ((event: AiAgentEvent) => void) | undefined;
    const api = createApi({
      onAiAgentEvent: vi.fn((nextListener) => {
        listener = nextListener;
        return () => undefined;
      }),
      sendAiMessage: vi.fn().mockImplementation(async () => {
        listener?.({
          sessionId: session.id,
          event: { type: "reasoning-delta", delta: "正在核对术语" },
        });
        listener?.({
          sessionId: session.id,
          event: {
            type: "tool",
            toolCallId: "call-1",
            name: "searchTranslationUnits",
            status: "running",
          },
        });
        listener?.({
          sessionId: session.id,
          event: { type: "text-delta", delta: "已完成当前范围检查。" },
        });
        return message("message-3", "assistant", "已完成当前范围检查。");
      }),
      listAiMessages: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          message("message-user", "user", "检查当前筛选结果"),
          message("message-3", "assistant", "已完成当前范围检查。"),
        ]),
    });

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    const input = await screen.findByPlaceholderText(
      "向 DeepSeek 询问，或让它审查并修改当前项目...",
    );
    fireEvent.change(input, { target: { value: "检查当前筛选结果" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(api.sendAiMessage).toHaveBeenCalledWith(
        "session-1",
        "main",
        "检查当前筛选结果",
      );
    });
    await waitFor(() => expect(api.listAiMessages).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("已完成当前范围检查。")).toBeVisible();
  });

  it("edits a staged revision proposal before applying it", async () => {
    const assistantWithProposal: AiMessageRecord = {
      id: "message-proposal",
      sessionId: session.id,
      parentMessageId: null,
      branchId: "main",
      role: "assistant",
      parts: [
        { type: "text", text: "发现一处译文需要修改。" },
        {
          type: "tool",
          toolCallId: "call-9",
          toolName: "proposeRevision",
          state: "output-available",
          input: { rowId: "row-1", suggestedTargetText: "Reset the alarm now" },
          output: {
            staged: true,
            revisionId: "rev-1",
            rowId: "row-1",
            suggestedTargetText: "Reset the alarm now",
          },
        },
      ],
      status: "complete",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      createdAt: "2026-07-15T06:00:00.000Z",
      updatedAt: "2026-07-15T06:00:00.000Z",
    };
    const revision: AiAgentRevisionRecord = {
      id: "rev-1",
      sessionId: session.id,
      messageId: "message-proposal",
      toolCallId: "call-9",
      projectId: "project-1",
      rowId: "row-1",
      sourceLang: "zh-CN",
      sourceText: "报警复位步骤",
      targetLang: "en-US",
      originalTargetText: "Reset alarm",
      suggestedTargetText: "Reset the alarm now",
      category: "accuracy",
      reason: "更贴合原文",
      confidence: 0.9,
      contentHash: "hash-1",
      status: "pending",
      createdAt: "2026-07-15T06:00:00.000Z",
      updatedAt: "2026-07-15T06:00:00.000Z",
      appliedAt: null,
    };
    const updatedRevision = {
      ...revision,
      suggestedTargetText: "Reset the alarm before continuing",
    };
    const api = createApi({
      listAiMessages: vi.fn().mockResolvedValue([assistantWithProposal]),
      listAiAgentRevisions: vi
        .fn()
        .mockResolvedValueOnce([revision])
        .mockResolvedValue([updatedRevision]),
      updateAiAgentRevision: vi.fn().mockResolvedValue(updatedRevision),
    });

    render(
      <AgentConversation
        api={api}
        projectId="project-1"
        renderToolbar={testToolbar}
      />,
    );

    expect(await screen.findByText(/待审阅修改建议/)).toBeVisible();
    // Each row is identified by its source text (no internal IDs); all selected by default.
    expect(await screen.findByText("报警复位步骤")).toBeVisible();

    fireEvent.click(screen.getByText("报警复位步骤"));
    fireEvent.click(screen.getByRole("button", { name: "编辑建议" }));
    fireEvent.change(screen.getByLabelText("编辑建议译文：报警复位步骤"), {
      target: { value: "Reset the alarm before continuing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(api.updateAiAgentRevision).toHaveBeenCalledWith(
        "rev-1",
        "Reset the alarm before continuing",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "应用所选" }));
    await waitFor(() =>
      expect(api.applyAiAgentRevisions).toHaveBeenCalledWith("session-1", [
        "rev-1",
      ]),
    );
  });
});
