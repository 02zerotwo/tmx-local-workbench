import type {
  AiMessage,
  AiSession,
  AiAgentRepository,
} from "../database/ai-agent-repository";

export type AiAgentRuntimeEvent =
  | { type: "status"; status: "thinking" | "using-tool" | "complete" }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "tool"; name: string; status: "running" | "complete" | "error" };

export type GenerateReply = (input: {
  session: AiSession;
  messages: AiMessage[];
  onEvent: (event: AiAgentRuntimeEvent) => void;
  abortSignal?: AbortSignal;
}) => Promise<string>;

type TranslationAgentServiceOptions = {
  repository: AiAgentRepository;
  generateReply: GenerateReply;
};

export class TranslationAgentService {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(private readonly options: TranslationAgentServiceOptions) {}

  createSession(projectId: string, title: string, model: string): AiSession {
    return this.options.repository.createSession({ projectId, title, model });
  }

  listSessions(projectId: string): AiSession[] {
    return this.options.repository.listSessions(projectId);
  }

  listMessages(sessionId: string, branchId: string): AiMessage[] {
    return this.options.repository.listMessages(sessionId, branchId);
  }

  stopMessage(sessionId: string): boolean {
    const controller = this.activeControllers.get(sessionId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async retryLastMessage(input: {
    sessionId: string;
    branchId: string;
    onEvent: (event: AiAgentRuntimeEvent) => void;
  }): Promise<AiMessage> {
    const session = this.options.repository.getSession(input.sessionId);
    if (!session) throw new Error("AI 会话不存在");
    const messages = this.options.repository.listMessages(input.sessionId, input.branchId);
    const userMessage = [...messages].reverse().find((message) => (
      message.role === "user" && message.status === "complete"
    ));
    if (!userMessage) throw new Error("没有可重试的用户消息");

    const controller = new AbortController();
    this.activeControllers.get(input.sessionId)?.abort();
    this.activeControllers.set(input.sessionId, controller);
    try {
      const text = await this.options.generateReply({
        session,
        messages,
        onEvent: input.onEvent,
        abortSignal: controller.signal,
      });
      const assistantMessage = this.options.repository.appendMessage({
        sessionId: input.sessionId,
        parentMessageId: userMessage.id,
        branchId: input.branchId,
        role: "assistant",
        parts: [{ type: "text", text }],
        status: "complete",
      });
      this.options.repository.createCheckpoint({
        sessionId: input.sessionId,
        branchId: input.branchId,
        messageId: assistantMessage.id,
      });
      input.onEvent({ type: "status", status: "complete" });
      return assistantMessage;
    } catch (error) {
      this.options.repository.appendMessage({
        sessionId: input.sessionId,
        parentMessageId: userMessage.id,
        branchId: input.branchId,
        role: "assistant",
        parts: [{
          type: "text",
          text: error instanceof Error ? error.message : "AI 回答中断",
        }],
        status: controller.signal.aborted ? "interrupted" : "error",
      });
      throw error;
    } finally {
      if (this.activeControllers.get(input.sessionId) === controller) {
        this.activeControllers.delete(input.sessionId);
      }
    }
  }

  async sendMessage(input: {
    sessionId: string;
    branchId: string;
    content: string;
    onEvent: (event: AiAgentRuntimeEvent) => void;
    abortSignal?: AbortSignal;
  }): Promise<AiMessage> {
    const session = this.options.repository.getSession(input.sessionId);
    if (!session) {
      throw new Error("AI 会话不存在");
    }
    const previousMessages = this.options.repository.listMessages(
      input.sessionId,
      input.branchId,
    );
    const userMessage = this.options.repository.appendMessage({
      sessionId: input.sessionId,
      parentMessageId: previousMessages.at(-1)?.id ?? null,
      branchId: input.branchId,
      role: "user",
      parts: [{ type: "text", text: input.content.trim() }],
      status: "complete",
    });
    const messages = [...previousMessages, userMessage];
    const controller = new AbortController();
    const abortSignal = input.abortSignal
      ? AbortSignal.any([controller.signal, input.abortSignal])
      : controller.signal;
    this.activeControllers.get(input.sessionId)?.abort();
    this.activeControllers.set(input.sessionId, controller);

    try {
      const text = await this.options.generateReply({
        session,
        messages,
        onEvent: input.onEvent,
        abortSignal,
      });
      const assistantMessage = this.options.repository.appendMessage({
        sessionId: input.sessionId,
        parentMessageId: userMessage.id,
        branchId: input.branchId,
        role: "assistant",
        parts: [{ type: "text", text }],
        status: "complete",
      });
      this.options.repository.createCheckpoint({
        sessionId: input.sessionId,
        branchId: input.branchId,
        messageId: assistantMessage.id,
      });
      input.onEvent({ type: "status", status: "complete" });
      return assistantMessage;
    } catch (error) {
      this.options.repository.appendMessage({
        sessionId: input.sessionId,
        parentMessageId: userMessage.id,
        branchId: input.branchId,
        role: "assistant",
        parts: [{
          type: "text",
          text: error instanceof Error ? error.message : "AI 回答中断",
        }],
        status: abortSignal.aborted ? "interrupted" : "error",
      });
      throw error;
    } finally {
      if (this.activeControllers.get(input.sessionId) === controller) {
        this.activeControllers.delete(input.sessionId);
      }
    }
  }
}
