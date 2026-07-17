// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAuditRepository } from "../database/ai-audit-repository";
import { ProjectRepository } from "../database/project-repository";
import { createTestDatabase, type TestDatabase } from "../database/test-database";
import { UnitRepository } from "../database/unit-repository";
import { AuditWorkflowService } from "./audit-workflow";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.cleanup();
});

describe("AuditWorkflowService", () => {
  it("audits the frozen filter scope and applies only confirmed suggestions", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const projectRepository = new ProjectRepository(testDatabase.db);
    const project = projectRepository.createProject({
      name: "Workflow project",
      sourceFileName: "workflow.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
      importStatus: "ready",
    });
    const units = new UnitRepository(testDatabase.db);
    units.insertUnits(project.id, [{
      rowId: "row-1",
      id: "unit-1",
      position: 1,
      sourceLang: "zh-CN",
      sourceText: "启动设备",
      targetLang: "en-US",
      targetText: "Start device",
      originalTargetText: "Start device",
    }]);
    const repository = new AiAuditRepository(testDatabase.db);
    const analyzeItem = vi.fn().mockResolvedValue([{
      category: "fluency",
      severity: "warning",
      summary: "缺少冠词",
      evidence: "英文表达不自然",
      suggestedTargetText: "Start the device",
      confidence: 0.95,
    }]);
    const workflow = new AuditWorkflowService({
      repository,
      unitRepository: units,
      analyzeItem,
      transaction: (operation) => testDatabase.db.transaction(operation)(),
    });

    const job = workflow.createJob({
      projectId: project.id,
      filters: { query: "", targetLanguage: "", status: "all", duplicateOnly: false },
      boundaries: {
        customRules: "",
        minConfidence: 0.8,
        allowRewrite: true,
        concurrency: 1,
      },
      model: "deepseek-v4-flash",
    });
    await workflow.runJob(job.id, () => undefined);

    expect(analyzeItem).toHaveBeenCalledTimes(1);
    expect(repository.getJob(job.id)?.status).toBe("complete");
    const [finding] = repository.listFindings(job.id);
    repository.setFindingDecision(finding.id, "accepted");

    expect(workflow.applyConfirmed(job.id)).toEqual({ applied: 1, stale: 0 });
    expect(units.queryProject({
      projectId: project.id,
      filters: { query: "", targetLanguage: "", status: "all", duplicateOnly: false },
      page: 1,
      pageSize: 100,
    }).rows[0].targetText).toBe("Start the device");
    expect(repository.getJob(job.id)?.status).toBe("applied");
    expect(() => workflow.setFindingDecision(finding.id, "rejected"))
      .toThrow("已应用的审查任务不可再编辑");
    expect(() => workflow.acceptAllPendingFindings(job.id))
      .toThrow("已应用的审查任务不可再编辑");
  });

  it("reports running again when a paused in-flight item is resumed", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Resume project",
      sourceFileName: "resume.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
      importStatus: "ready",
    });
    const units = new UnitRepository(testDatabase.db);
    units.insertUnits(project.id, [{
      rowId: "row-1",
      id: "unit-1",
      position: 1,
      sourceLang: "zh-CN",
      sourceText: "停止",
      targetLang: "en-US",
      targetText: "Stop",
      originalTargetText: "Stop",
    }]);
    const repository = new AiAuditRepository(testDatabase.db);
    let finishAnalysis!: (value: []) => void;
    const workflow = new AuditWorkflowService({
      repository,
      unitRepository: units,
      analyzeItem: () => new Promise((resolve) => { finishAnalysis = resolve; }),
      transaction: (operation) => testDatabase.db.transaction(operation)(),
    });
    const job = workflow.createJob({
      projectId: project.id,
      filters: { query: "", targetLanguage: "", status: "all", duplicateOnly: false },
      boundaries: { customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 1 },
      model: "deepseek-v4-flash",
    });
    const events: string[] = [];
    const running = workflow.runJob(job.id, (event) => {
      if (event.type === "status") events.push(event.job.status);
    });
    workflow.pauseJob(job.id);

    const resumed = await workflow.resumeJob(job.id, (event) => {
      if (event.type === "status") events.push(event.job.status);
    });
    expect(resumed.status).toBe("running");
    finishAnalysis([]);
    await running;
    expect(events).toContain("running");
  });

  it("processes items concurrently up to the limit without double-claiming", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const project = new ProjectRepository(testDatabase.db).createProject({
      name: "Concurrency project",
      sourceFileName: "concurrency.tmx",
      sourceLanguage: "zh-CN",
      targetLanguages: ["en-US"],
      fileSize: 100,
      importStatus: "ready",
    });
    const units = new UnitRepository(testDatabase.db);
    units.insertUnits(project.id, Array.from({ length: 10 }, (_, index) => ({
      rowId: `row-${index}`,
      id: `unit-${index}`,
      position: index + 1,
      sourceLang: "zh-CN",
      sourceText: `源文 ${index}`,
      targetLang: "en-US",
      targetText: `Target ${index}`,
      originalTargetText: `Target ${index}`,
    })));
    const repository = new AiAuditRepository(testDatabase.db);
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: string[] = [];
    const analyzeItem = vi.fn().mockImplementation(async (input: { sourceText: string }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(input.sourceText);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [];
    });
    const workflow = new AuditWorkflowService({
      repository,
      unitRepository: units,
      analyzeItem,
      transaction: (operation) => testDatabase.db.transaction(operation)(),
    });
    const job = workflow.createJob({
      projectId: project.id,
      filters: { query: "", targetLanguage: "", status: "all", duplicateOnly: false },
      boundaries: { customRules: "", minConfidence: 0.8, allowRewrite: true, concurrency: 4 },
      model: "deepseek-v4-flash",
    });

    await workflow.runJob(job.id, () => undefined);

    expect(analyzeItem).toHaveBeenCalledTimes(10);
    expect(new Set(seen).size).toBe(10);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(repository.getJob(job.id)?.status).toBe("complete");
    expect(repository.getJob(job.id)?.completedItems).toBe(10);
  });
});
