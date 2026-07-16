"use client";

import {
  Bot,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { AssistantMessageParts } from "@/components/ai/assistant-message-parts";
import { MarkdownResponse } from "@/components/ai/markdown-response";
import { RevisionReviewList } from "@/components/ai/revision-review-list";
import { SessionHistoryDrawer } from "@/components/ai/session-history-drawer";
import { Button } from "@/components/ui/button";
import type {
  AiAgentEvent,
  AiAgentRevisionRecord,
  AiMessagePart,
  AiMessageRecord,
  AiSessionRecord,
  TmxDesktopApi,
} from "@/lib/desktop-types";

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

type AgentConversationProps = {
  api: AgentApi;
  projectId: string;
  onApplied?: () => void;
};

type AgentRuntimeEvent = AiAgentEvent["event"];

/**
 * 把按执行顺序到达的流事件归约成一个有序片段数组：与上一段同类型则追加，
 * 否则新起一段。这样文字与工具调用严格按调用顺序排列，不再出现错位。
 */
function reduceLivePart(
  parts: AiMessagePart[],
  event: AgentRuntimeEvent,
): AiMessagePart[] {
  if (event.type === "text-delta" || event.type === "reasoning-delta") {
    const type = event.type === "text-delta" ? "text" : "reasoning";
    const last = parts.at(-1);
    if (last && last.type === type) {
      return [...parts.slice(0, -1), { type, text: last.text + event.delta }];
    }
    return [...parts, { type, text: event.delta }];
  }
  if (event.type === "tool") {
    if (event.status === "running") {
      if (
        parts.some(
          (part) => part.type === "tool" && part.toolCallId === event.toolCallId,
        )
      ) {
        return parts;
      }
      return [
        ...parts,
        {
          type: "tool",
          toolCallId: event.toolCallId,
          toolName: event.name,
          state: "input-available",
          input: event.input,
        },
      ];
    }
    return parts.map((part) =>
      part.type === "tool" && part.toolCallId === event.toolCallId
        ? {
            ...part,
            state:
              event.status === "error" ? "output-error" : "output-available",
            output: event.output,
          }
        : part,
    );
  }
  return parts;
}

function getText(parts: AiMessagePart[]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function shortTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 会话操作失败";
}

export function AgentConversation({
  api,
  projectId,
  onApplied,
}: AgentConversationProps) {
  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRecord[]>([]);
  const [revisions, setRevisions] = useState<AiAgentRevisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [liveParts, setLiveParts] = useState<AiMessagePart[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const activeSessionIdRef = useRef<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const pendingRevisions = useMemo(
    () => revisions.filter((revision) => revision.status === "pending"),
    [revisions],
  );
  const checkpointSaved = messages.some(
    (message) => message.role === "assistant" && message.status === "complete",
  );
  const lastMessage = messages.at(-1);
  const retryAvailable =
    messages.some((message) => message.role === "user") &&
    lastMessage?.role === "assistant" &&
    (lastMessage.status === "interrupted" || lastMessage.status === "error");

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadSessions = useCallback(async () => {
    const nextSessions = await api.listAiSessions(projectId);
    setSessions(nextSessions);
    setActiveSessionId((current) =>
      current && nextSessions.some((session) => session.id === current)
        ? current
        : (nextSessions[0]?.id ?? null),
    );
  }, [api, projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSessions()
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSessions]);

  const loadMessages = useCallback(
    async (sessionId: string) => {
      const nextMessages = await api.listAiMessages(sessionId, "main");
      setMessages(nextMessages);
    },
    [api],
  );

  const loadRevisions = useCallback(
    async (sessionId: string) => {
      const nextRevisions = await api.listAiAgentRevisions(sessionId);
      setRevisions(nextRevisions);
    },
    [api],
  );

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setRevisions([]);
      return;
    }
    setError("");
    loadMessages(activeSessionId).catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });
    loadRevisions(activeSessionId).catch(() => undefined);
  }, [activeSessionId, loadMessages, loadRevisions]);

  useEffect(
    () =>
      api.onAiAgentEvent(({ sessionId, event }) => {
        if (sessionId !== activeSessionIdRef.current) return;
        if (event.type === "revision") {
          setRevisions((current) => [
            ...current.filter((item) => item.id !== event.revision.id),
            event.revision,
          ]);
          return;
        }
        if (event.type === "status") return;
        setLiveParts((current) => reduceLivePart(current, event));
      }),
    [api],
  );

  const createSession = useCallback(
    async (title = "新会话") => {
      const created = await api.createAiSession(projectId, title);
      setSessions((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      activeSessionIdRef.current = created.id;
      setActiveSessionId(created.id);
      setMessages([]);
      setRevisions([]);
      return created;
    },
    [api, projectId],
  );

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError("");
    setLiveParts([]);

    try {
      const session =
        activeSession ?? (await createSession(shortTitle(trimmed)));
      setMessages((current) => [
        ...current,
        {
          id: `optimistic-${Date.now()}`,
          sessionId: session.id,
          parentMessageId: current.at(-1)?.id ?? null,
          branchId: "main",
          role: "user",
          parts: [{ type: "text", text: trimmed }],
          status: "complete",
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      await api.sendAiMessage(session.id, "main", trimmed);
      await loadMessages(session.id);
      await loadRevisions(session.id);
      await loadSessions();
      setLiveParts([]);
    } catch (sendError) {
      setError(getErrorMessage(sendError));
      if (activeSessionIdRef.current) {
        await loadMessages(activeSessionIdRef.current).catch(() => undefined);
      }
    } finally {
      setSending(false);
    }
  };

  const stopMessage = async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      await api.stopAiMessage(sessionId);
    } catch (stopError) {
      setError(getErrorMessage(stopError));
    }
  };

  const retryMessage = async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sending) return;
    setSending(true);
    setError("");
    setLiveParts([]);
    try {
      await api.retryAiMessage(sessionId, "main");
      await loadMessages(sessionId);
      await loadRevisions(sessionId);
      await loadSessions();
    } catch (retryError) {
      setError(getErrorMessage(retryError));
      await loadMessages(sessionId).catch(() => undefined);
    } finally {
      setLiveParts([]);
      setSending(false);
    }
  };

  const applyRevisions = async (ids: string[]) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || ids.length === 0) return;
    setRevisionBusy(true);
    setError("");
    try {
      await api.applyAiAgentRevisions(sessionId, ids);
      await loadRevisions(sessionId);
      onApplied?.();
    } catch (applyError) {
      setError(getErrorMessage(applyError));
    } finally {
      setRevisionBusy(false);
    }
  };

  const ignoreRevisions = async (ids: string[]) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || ids.length === 0) return;
    setRevisionBusy(true);
    setError("");
    try {
      await Promise.all(ids.map((id) => api.ignoreAiAgentRevision(id)));
      await loadRevisions(sessionId);
    } catch (ignoreError) {
      setError(getErrorMessage(ignoreError));
    } finally {
      setRevisionBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2">
        <Button
          aria-label="历史会话"
          className="h-7 gap-1.5 px-2 text-xs text-slate-600"
          onClick={() => setHistoryOpen(true)}
          size="sm"
          title="历史会话"
          type="button"
        >
          <History size={14} />
          历史
        </Button>
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700"
          title={activeSession?.title}
        >
          {activeSession?.title ?? "新会话"}
        </span>
        <Button
          aria-label="新建会话"
          onClick={() => void createSession()}
          size="icon-sm"
          title="新建会话"
          type="button"
          variant="ghost"
        >
          <MessageSquarePlus />
        </Button>
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Conversation className="min-h-0">
          <ConversationContent className="gap-5 p-3">
            {!loading && messages.length === 0 && !sending ? (
              <ConversationEmptyState
                description="可让我搜索并审查译文、自动给出修改建议，审阅后一键应用。"
                icon={<Bot size={24} />}
                title="开始项目对话"
              />
            ) : null}
            {messages.map((message) => (
              <Message
                from={message.role === "user" ? "user" : "assistant"}
                key={message.id}
              >
                <MessageContent
                  className={message.role === "user" ? undefined : "w-full"}
                >
                  {message.role === "user" ? (
                    <MarkdownResponse content={getText(message.parts)} />
                  ) : (
                    <AssistantMessageParts parts={message.parts} />
                  )}
                </MessageContent>
              </Message>
            ))}
            {sending ? (
              <Message from="assistant">
                <MessageContent className="w-full">
                  {liveParts.length > 0 ? (
                    <AssistantMessageParts parts={liveParts} streaming />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="animate-spin" size={14} />
                      正在准备检查
                    </div>
                  )}
                </MessageContent>
              </Message>
            ) : null}
            {checkpointSaved ? (
              <Checkpoint>
                <CheckpointIcon />
                <CheckpointTrigger disabled>检查点已保存</CheckpointTrigger>
              </Checkpoint>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton title="滚动到底部" />
        </Conversation>

        {error ? (
          <div
            className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            <span className="min-w-0 flex-1">{error}</span>
            {retryAvailable ? (
              <Button
                onClick={() => void retryMessage()}
                size="sm"
                variant="ghost"
              >
                重试
              </Button>
            ) : null}
          </div>
        ) : null}

        {pendingRevisions.length > 0 ? (
          <RevisionReviewList
            busy={revisionBusy}
            onApply={(ids) => void applyRevisions(ids)}
            onIgnore={(ids) => void ignoreRevisions(ids)}
            revisions={pendingRevisions}
          />
        ) : null}

        <div className="border-t border-slate-200 bg-white p-2">
          <PromptInput onSubmit={({ text }) => sendMessage(text)}>
            <PromptInputBody>
              <PromptInputTextarea
                disabled={sending}
                placeholder="向 DeepSeek 询问，或让它审查并修改当前项目..."
              />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="px-1 text-[11px] text-slate-400">
                Enter 发送，Shift+Enter 换行
              </span>
              <PromptInputSubmit
                aria-label="发送"
                disabled={!activeSessionId && loading}
                onStop={() => void stopMessage()}
                status={sending ? "streaming" : "ready"}
                title={sending ? "停止生成" : "发送消息"}
              >
                {sending ? <Square /> : <Send />}
              </PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </div>
      </section>

      <SessionHistoryDrawer
        activeSessionId={activeSessionId}
        loading={loading}
        onCreate={() => {
          void createSession();
          setHistoryOpen(false);
        }}
        onOpenChange={setHistoryOpen}
        onSelect={(sessionId) => {
          activeSessionIdRef.current = sessionId;
          setActiveSessionId(sessionId);
          setHistoryOpen(false);
        }}
        open={historyOpen}
        sessions={sessions}
      />
    </div>
  );
}
