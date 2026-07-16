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

type AgentApi = Pick<
  TmxDesktopApi,
  | "listAiSessions"
  | "createAiSession"
  | "listAiMessages"
  | "sendAiMessage"
  | "stopAiMessage"
  | "retryAiMessage"
  | "onAiAgentEvent"
  | "listAiAgentRevisions"
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
    listAiMessages: vi.fn().mockResolvedValue([
      message("message-1", "user", "检查这个项目的术语"),
      message("message-2", "assistant", "发现 2 个术语不一致。"),
    ]),
    sendAiMessage: vi.fn().mockResolvedValue(
      message("message-3", "assistant", "已完成当前范围检查。"),
    ),
    stopAiMessage: vi.fn().mockResolvedValue(true),
    retryAiMessage: vi.fn().mockResolvedValue(
      message("message-retry", "assistant", "已重试"),
    ),
    onAiAgentEvent: vi.fn().mockReturnValue(() => undefined),
    listAiAgentRevisions: vi.fn().mockResolvedValue([]),
    applyAiAgentRevisions: vi.fn().mockResolvedValue({ applied: 0, stale: 0, missing: 0 }),
    ignoreAiAgentRevision: vi.fn(),
    ...overrides,
  };
}

describe("AgentConversation", () => {
  it("restores project sessions and persisted messages", async () => {
    const api = createApi();

    render(<AgentConversation api={api} projectId="project-1" />);

    expect(await screen.findByText("术语检查")).toBeVisible();
    expect(await screen.findByText("检查这个项目的术语")).toBeVisible();
    expect(screen.getByText("发现 2 个术语不一致。")).toBeVisible();
    expect(api.listAiMessages).toHaveBeenCalledWith("session-1", "main");
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
      listAiMessages: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          message("message-user", "user", "检查当前筛选结果"),
          message("message-3", "assistant", "已完成当前范围检查。"),
        ]),
    });

    render(<AgentConversation api={api} projectId="project-1" />);

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
    expect(await screen.findByText("检查点已保存")).toBeVisible();
  });

  it("renders a staged revision proposal from an ordered tool part and applies it", async () => {
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
    const api = createApi({
      listAiMessages: vi.fn().mockResolvedValue([assistantWithProposal]),
      listAiAgentRevisions: vi.fn().mockResolvedValue([revision]),
    });

    render(<AgentConversation api={api} projectId="project-1" />);

    expect(await screen.findByText(/待审阅修改建议/)).toBeVisible();
    // Each row is identified by its source text (no internal IDs); all selected by default.
    expect(await screen.findByText("报警复位步骤")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "应用所选" }));
    await waitFor(() =>
      expect(api.applyAiAgentRevisions).toHaveBeenCalledWith("session-1", ["rev-1"]),
    );
  });
});
