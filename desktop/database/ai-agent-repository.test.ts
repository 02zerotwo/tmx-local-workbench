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
});
