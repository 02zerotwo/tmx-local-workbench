"use client";

import {
  Bot,
  History,
  MessageSquarePlus,
  Send,
  Square,
  Wrench,
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
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { MarkdownResponse } from "@/components/ai/markdown-response";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
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
>;

type AgentConversationProps = {
  api: AgentApi;
  projectId: string;
};

type ToolState = {
  name: string;
  status: "running" | "complete" | "error";
};

function getText(message: AiMessageRecord): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => (
      Boolean(
        part
        && typeof part === "object"
        && "type" in part
        && "text" in part
        && part.type === "text"
        && typeof part.text === "string",
      )
    ))
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

export function AgentConversation({ api, projectId }: AgentConversationProps) {
  const [sessions, setSessions] = useState<AiSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [tools, setTools] = useState<ToolState[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const checkpointSaved = messages.some((message) => (
    message.role === "assistant" && message.status === "complete"
  ));
  const lastMessage = messages.at(-1);
  const retryAvailable = messages.some((message) => message.role === "user")
    && lastMessage?.role === "assistant"
    && (lastMessage.status === "interrupted" || lastMessage.status === "error");

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadSessions = useCallback(async () => {
    const nextSessions = await api.listAiSessions(projectId);
    setSessions(nextSessions);
    setActiveSessionId((current) => (
      current && nextSessions.some((session) => session.id === current)
        ? current
        : nextSessions[0]?.id ?? null
    ));
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
    return () => { active = false; };
  }, [loadSessions]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const nextMessages = await api.listAiMessages(sessionId, "main");
    setMessages(nextMessages);
  }, [api]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    setError("");
    loadMessages(activeSessionId).catch((loadError: unknown) => {
      setError(getErrorMessage(loadError));
    });
  }, [activeSessionId, loadMessages]);

  useEffect(() => api.onAiAgentEvent(({ sessionId, event }) => {
    if (sessionId !== activeSessionIdRef.current) return;
    if (event.type === "text-delta") {
      setStreamedText((current) => current + event.delta);
    } else if (event.type === "reasoning-delta") {
      setReasoning((current) => current + event.delta);
    } else if (event.type === "tool") {
      setTools((current) => {
        const withoutCurrent = current.filter((item) => item.name !== event.name);
        return [...withoutCurrent, { name: event.name, status: event.status }];
      });
    }
  }), [api]);

  const createSession = useCallback(async (title = "新会话") => {
    const created = await api.createAiSession(projectId, title);
    setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    activeSessionIdRef.current = created.id;
    setActiveSessionId(created.id);
    setMessages([]);
    return created;
  }, [api, projectId]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError("");
    setStreamedText("");
    setReasoning("");
    setTools([]);

    try {
      const session = activeSession ?? await createSession(shortTitle(trimmed));
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
      await loadSessions();
      setStreamedText("");
      setReasoning("");
      setTools([]);
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
    setStreamedText("");
    setReasoning("");
    setTools([]);
    try {
      await api.retryAiMessage(sessionId, "main");
      await loadMessages(sessionId);
      await loadSessions();
    } catch (retryError) {
      setError(getErrorMessage(retryError));
      await loadMessages(sessionId).catch(() => undefined);
    } finally {
      setStreamedText("");
      setReasoning("");
      setTools([]);
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <aside className="flex w-36 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex h-10 items-center gap-2 border-b border-slate-200 px-2 text-xs font-semibold text-slate-700">
          <History size={14} />
          历史会话
          <Button
            aria-label="新建会话"
            className="ml-auto"
            onClick={() => void createSession()}
            size="icon-xs"
            title="新建会话"
            variant="ghost"
          >
            <MessageSquarePlus />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {sessions.length === 0 && !loading ? (
            <p className="px-2 py-3 text-xs leading-5 text-slate-400">发送消息后自动创建会话</p>
          ) : null}
          {sessions.map((session) => (
            <Button
              className={cn(
                "mb-1 h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs leading-4",
                session.id === activeSessionId && "bg-white text-blue-700 shadow-sm",
              )}
              key={session.id}
              onClick={() => {
                activeSessionIdRef.current = session.id;
                setActiveSessionId(session.id);
              }}
              title={session.title}
              variant="ghost"
            >
              <span className="line-clamp-2">{session.title}</span>
            </Button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <Conversation className="min-h-0">
          <ConversationContent className="gap-5 p-3">
            {!loading && messages.length === 0 && !sending ? (
              <ConversationEmptyState
                description="可询问术语、译文质量、项目统计，或继续历史检查。"
                icon={<Bot size={24} />}
                title="开始项目对话"
              />
            ) : null}
            {messages.map((message) => (
              <Message from={message.role === "user" ? "user" : "assistant"} key={message.id}>
                <MessageContent>
                  <MarkdownResponse content={getText(message)} />
                </MessageContent>
              </Message>
            ))}
            {sending ? (
              <Message from="assistant">
                <MessageContent className="w-full">
                  {reasoning ? (
                    <Reasoning isStreaming>
                      <ReasoningTrigger
                        getThinkingMessage={() => "正在思考"}
                      />
                      <ReasoningContent>{reasoning}</ReasoningContent>
                    </Reasoning>
                  ) : null}
                  {tools.map((tool) => (
                    <Tool key={tool.name}>
                      <ToolHeader
                        state={
                          tool.status === "complete"
                            ? "output-available"
                            : tool.status === "error"
                              ? "output-error"
                              : "input-available"
                        }
                        title={tool.name}
                        toolName={tool.name}
                        type="dynamic-tool"
                      />
                    </Tool>
                  ))}
                  {streamedText ? (
                    <MarkdownResponse content={streamedText} streaming />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Wrench className="animate-pulse" size={14} />
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
          <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            <span className="min-w-0 flex-1">{error}</span>
            {retryAvailable ? (
              <Button onClick={() => void retryMessage()} size="sm" variant="ghost">
                重试
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="border-t border-slate-200 bg-white p-2">
          <PromptInput onSubmit={({ text }) => sendMessage(text)}>
            <PromptInputBody>
              <PromptInputTextarea
                disabled={sending}
                placeholder="向 DeepSeek 询问当前项目..."
              />
            </PromptInputBody>
            <PromptInputFooter>
              <span className="px-1 text-[11px] text-slate-400">Enter 发送，Shift+Enter 换行</span>
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
    </div>
  );
}
