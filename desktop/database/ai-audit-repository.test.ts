// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { AiAuditRepository } from "./ai-audit-repository";
import { ProjectRepository } from "./project-repository";
import { createTestDatabase, type TestDatabase } from "./test-database";
import { UnitRepository } from "./unit-repository";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.cleanup();
});

describe("AiAuditRepository", () => {
  it("persists an immutable queue and staged findings for later confirmation", () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Audit project",
      sourceFileName: "audit.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
      importStatus: "ready",
    });
    new UnitRepository(testDatabase.db).insertUnits(project.id, [{
      rowId: "row-1",
      id: "unit-1",
      position: 1,
      sourceLang: "zh-CN",
      sourceText: "启动设备",
      targetLang: "en-US",
      targetText: "Start device",
      originalTargetText: "Start device",
    }]);
    let nextId = 1;
    const repository = new AiAuditRepository(testDatabase.db, {
      createId: () => `audit-${nextId++}`,
      now: () => new Date("2026-07-15T07:00:00.000Z"),
    });

    const job = repository.createJob({
      projectId: project.id,
      filters: { query: "", targetLanguage: "", status: "all", duplicateOnly: false },
      boundaries: {
        categories: ["accuracy", "terminology"],
        minConfidence: 0.8,
        allowRewrite: true,
      },
      model: "deepseek-v4-flash",
      rows: [{ rowId: "row-1", contentHash: "hash-1" }],
    });

    expect(job.totalItems).toBe(1);
    const item = repository.getNextPendingItem(job.id);
    expect(item).toMatchObject({ rowId: "row-1", sourceText: "启动设备" });

    repository.recordItemResult(job.id, item!.id, [{
      category: "accuracy",
      severity: "warning",
      summary: "缺少冠词",
      evidence: "目标文本表达不自然",
      suggestedTargetText: "Start the device",
      confidence: 0.92,
      contentHash: "hash-1",
      model: "deepseek-v4-flash",
      promptVersion: "audit-v1",
    }]);

    const [finding] = repository.listFindings(job.id);
    expect(finding).toMatchObject({
      sourceText: "启动设备",
      targetText: "Start device",
      suggestedTargetText: "Start the device",
      decision: "pending",
    });
    expect(repository.acceptAllPendingFindings(job.id)).toBe(1);
    expect(repository.listFindings(job.id)[0].decision).toBe("accepted");
    expect(repository.getJob(job.id)).toMatchObject({ completedItems: 1, findingItems: 1 });

    repository.setJobStatus(job.id, "running");
    expect(repository.recoverInterruptedJobs()).toBe(1);
    expect(repository.getJob(job.id)?.status).toBe("paused");
  });
});
