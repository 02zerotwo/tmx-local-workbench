// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { AiAgentRepository } from "../database/ai-agent-repository";
import { AgentRevisionRepository } from "../database/ai-agent-revision-repository";
import { ProjectRepository } from "../database/project-repository";
import { UnitRepository } from "../database/unit-repository";
import {
  createTestDatabase,
  type TestDatabase,
} from "../database/test-database";
import { AgentRevisionService } from "./agent-revision-service";
import { translationContentHash } from "./audit-workflow";
import type { TranslationUnitRow } from "../../src/lib/desktop-types";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

function setup() {
  const testDatabase = createTestDatabase();
  databases.push(testDatabase);
  const projectRepository = new ProjectRepository(testDatabase.db);
  const unitRepository = new UnitRepository(testDatabase.db);
  const project = projectRepository.createProject({
    name: "Revision project",
    sourceFileName: "rev.tmx",
    sourceLanguage: "zh-CN",
    targetLanguages: ["en-US"],
    fileSize: 100,
    importStatus: "ready",
  });
  unitRepository.insertUnits(project.id, [
    {
      rowId: "row-1",
      id: "ext-1",
      position: 1,
      sourceLang: "zh-CN",
      sourceText: "报警复位步骤",
      targetLang: "en-US",
      targetText: "Reset alarm",
      originalTargetText: "Reset alarm",
      metadata: {},
      duplicateKey: null,
    },
  ]);
  const session = new AiAgentRepository(testDatabase.db).createSession({
    projectId: project.id,
    title: "会话",
    model: "deepseek-v4-flash",
  });
  const revisionRepository = new AgentRevisionRepository(testDatabase.db);
  const service = new AgentRevisionService({
    repository: revisionRepository,
    unitRepository,
    transaction: (operation) => testDatabase.db.transaction(operation)(),
  });
  return { project, unitRepository, session, revisionRepository, service };
}

function stage(
  revisionRepository: AgentRevisionRepository,
  sessionId: string,
  projectId: string,
  current: TranslationUnitRow,
  suggestedTargetText: string,
) {
  return revisionRepository.createRevision({
    sessionId,
    toolCallId: `call-${suggestedTargetText}`,
    projectId,
    rowId: current.rowId,
    sourceLang: current.sourceLang,
    sourceText: current.sourceText,
    targetLang: current.targetLang,
    originalTargetText: current.targetText,
    suggestedTargetText,
    category: "accuracy",
    reason: "更准确",
    confidence: 0.9,
    contentHash: translationContentHash(current),
  });
}

describe("AgentRevisionService", () => {
  it("updates the suggested text of a pending revision", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Reset the alarm now",
    );

    const updated = service.updateRevision(
      revision.id,
      "Reset the alarm before continuing",
    );

    expect(updated.suggestedTargetText).toBe(
      "Reset the alarm before continuing",
    );
    expect(service.listRevisions(session.id)[0]?.suggestedTargetText).toBe(
      "Reset the alarm before continuing",
    );
  });

  it("rejects a blank suggested translation", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Reset the alarm now",
    );

    expect(() => service.updateRevision(revision.id, "   "))
      .toThrow("建议译文不能为空");
  });

  it("rejects editing a revision that is no longer pending", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Reset the alarm now",
    );
    revisionRepository.setStatus(revision.id, "applied");

    expect(() => service.updateRevision(revision.id, "Changed after apply"))
      .toThrow("仅待审阅建议可以编辑");
  });

  it("applies a pending revision and writes the suggested target text", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Reset the alarm now",
    );

    const result = service.applyRevisions([revision.id]);

    expect(result).toEqual({ applied: 1, stale: 0, missing: 0 });
    expect(unitRepository.getUnitRow(project.id, "row-1")?.targetText).toBe(
      "Reset the alarm now",
    );
    expect(service.listRevisions(session.id)[0]?.status).toBe("applied");
  });

  it("marks a revision stale and does not overwrite when the row changed after proposal", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Agent suggestion",
    );
    // A human edits the same row after the agent staged its proposal.
    unitRepository.updateTranslation(project.id, "row-1", {
      sourceText: current.sourceText,
      targetText: "Human edit wins",
    });

    const result = service.applyRevisions([revision.id]);

    expect(result).toEqual({ applied: 0, stale: 1, missing: 0 });
    expect(unitRepository.getUnitRow(project.id, "row-1")?.targetText).toBe(
      "Human edit wins",
    );
    expect(service.listRevisions(session.id)[0]?.status).toBe("stale");
  });

  it("ignores a revision so it is never applied", () => {
    const { project, unitRepository, session, revisionRepository, service } = setup();
    const current = unitRepository.getUnitRow(project.id, "row-1")!;
    const revision = stage(
      revisionRepository,
      session.id,
      project.id,
      current,
      "Ignored suggestion",
    );

    service.ignoreRevision(revision.id);
    const result = service.applyRevisions([revision.id]);

    expect(service.listRevisions(session.id)[0]?.status).toBe("ignored");
    expect(result.applied).toBe(0);
    expect(unitRepository.getUnitRow(project.id, "row-1")?.targetText).toBe(
      "Reset alarm",
    );
  });
});
