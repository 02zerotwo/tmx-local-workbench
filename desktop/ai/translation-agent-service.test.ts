// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { AiAgentRepository } from "../database/ai-agent-repository";
import { ProjectRepository } from "../database/project-repository";
import { createTestDatabase, type TestDatabase } from "../database/test-database";
import { TranslationAgentService } from "./translation-agent-service";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

describe("TranslationAgentService", () => {
  it("persists both sides of a conversation and creates a continuation checkpoint", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Agent project",
      sourceFileName: "agent.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
    });
    let nextId = 1;
    const repository = new AiAgentRepository(testDatabase.db, {
      createId: () => `agent-${nextId++}`,
      now: () => new Date("2026-07-15T07:00:00.000Z"),
    });
    const service = new TranslationAgentService({
      repository,
      generateReply: async ({ onEvent }) => {
        onEvent({ type: "text-delta", delta: "检查完成" });
        return "检查完成";
      },
    });
    const session = service.createSession(project.id, "新会话", "deepseek-v4-flash");

    await service.sendMessage({
      sessionId: session.id,
      branchId: "main",
      content: "检查术语",
      onEvent: () => undefined,
    });

    const messages = service.listMessages(session.id, "main");
    expect(messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(messages[1].parts).toEqual([{ type: "text", text: "检查完成" }]);
    expect(repository.getLatestCheckpoint(session.id, "main")?.messageId)
      .toBe(messages[1].id);
  });

  it("stops an active reply and preserves an interrupted message for continuation", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Stopped agent project",
      sourceFileName: "stopped.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
    });
    const repository = new AiAgentRepository(testDatabase.db);
    const service = new TranslationAgentService({
      repository,
      generateReply: ({ abortSignal }) => new Promise((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () => reject(new Error("已停止")), {
          once: true,
        });
      }),
    });
    const session = service.createSession(project.id, "可停止会话", "deepseek-v4-flash");

    const sending = service.sendMessage({
      sessionId: session.id,
      branchId: "main",
      content: "开始检查",
      onEvent: () => undefined,
    });
    expect(service.stopMessage(session.id)).toBe(true);
    await expect(sending).rejects.toThrow("已停止");

    expect(service.listMessages(session.id, "main").at(-1)?.status).toBe("interrupted");
  });

  it("retries from the last user checkpoint without duplicating the user message", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Retry agent project",
      sourceFileName: "retry.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
    });
    const repository = new AiAgentRepository(testDatabase.db);
    let attempt = 0;
    const service = new TranslationAgentService({
      repository,
      generateReply: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("网络中断");
        return "重试完成";
      },
    });
    const session = service.createSession(project.id, "重试会话", "deepseek-v4-flash");

    await expect(service.sendMessage({
      sessionId: session.id,
      branchId: "main",
      content: "检查项目",
      onEvent: () => undefined,
    })).rejects.toThrow("网络中断");
    await service.retryLastMessage({
      sessionId: session.id,
      branchId: "main",
      onEvent: () => undefined,
    });

    const messages = service.listMessages(session.id, "main");
    expect(messages.map(({ role }) => role)).toEqual(["user", "assistant", "assistant"]);
    expect(messages.at(-1)?.parts).toEqual([{ type: "text", text: "重试完成" }]);
  });
});
