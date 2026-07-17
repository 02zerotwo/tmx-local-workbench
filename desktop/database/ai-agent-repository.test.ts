// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { AiAgentRepository } from "./ai-agent-repository";
import { ProjectRepository } from "./project-repository";
import { createTestDatabase, type TestDatabase } from "./test-database";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

describe("AiAgentRepository", () => {
  it("persists project sessions, structured messages, and resumable checkpoints", () => {
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
      createId: () => `ai-${nextId++}`,
      now: () => new Date("2026-07-15T05:00:00.000Z"),
    });

    const session = repository.createSession({
      projectId: project.id,
      title: "检查术语一致性",
      model: "deepseek-v4-flash",
    });
    const message = repository.appendMessage({
      sessionId: session.id,
      branchId: "main",
      role: "user",
      parts: [{ type: "text", text: "检查当前项目" }],
      status: "complete",
    });
    const checkpoint = repository.createCheckpoint({
      sessionId: session.id,
      branchId: "main",
      messageId: message.id,
      contextSummary: "用户准备检查项目术语",
    });

    expect(repository.listSessions(project.id)).toEqual([session]);
    expect(repository.listMessages(session.id, "main")).toEqual([message]);
    expect(repository.getLatestCheckpoint(session.id, "main")).toEqual(checkpoint);
  });

  it("renames a session with a trimmed title and rejects invalid input", () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Rename session",
      sourceFileName: "rename.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
    });
    const repository = new AiAgentRepository(testDatabase.db, {
      createId: () => "session-rename",
      now: () => new Date("2026-07-17T05:00:00.000Z"),
    });
    const session = repository.createSession({
      projectId: project.id,
      title: "旧名称",
      model: "deepseek-v4-flash",
    });

    expect(repository.renameSession(session.id, "  新名称  ").title).toBe("新名称");
    expect(() => repository.renameSession(session.id, "   ")).toThrow(/会话标题/);
    expect(() => repository.renameSession("missing", "新名称")).toThrow(/会话不存在/);
  });

  it("deletes a session and all cascade-related records", () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Delete session",
      sourceFileName: "delete.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
    });
    let nextId = 1;
    const repository = new AiAgentRepository(testDatabase.db, {
      createId: () => `delete-${nextId++}`,
      now: () => new Date("2026-07-17T05:00:00.000Z"),
    });
    const session = repository.createSession({
      projectId: project.id,
      title: "待删除",
      model: "deepseek-v4-flash",
    });
    const message = repository.appendMessage({
      sessionId: session.id,
      branchId: "main",
      role: "user",
      parts: [{ type: "text", text: "删除我" }],
      status: "complete",
    });
    repository.createCheckpoint({
      sessionId: session.id,
      branchId: "main",
      messageId: message.id,
    });

    expect(repository.deleteSession(session.id)).toBe(true);
    expect(repository.getSession(session.id)).toBeNull();
    expect(testDatabase.db.prepare(
      "SELECT COUNT(*) AS count FROM ai_agent_messages WHERE session_id = ?",
    ).get(session.id)).toEqual({ count: 0 });
    expect(testDatabase.db.prepare(
      "SELECT COUNT(*) AS count FROM ai_agent_checkpoints WHERE session_id = ?",
    ).get(session.id)).toEqual({ count: 0 });
    expect(() => repository.deleteSession("missing")).toThrow(/会话不存在/);
  });
});
