// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
  ExportProgress,
  ImportProgress,
  TmxDesktopApi,
} from "../../src/lib/desktop-types";
import { IPC_CHANNELS } from "./channels";
import { createDesktopApi } from "../preload-bridge";

const METHOD_NAMES = [
  "listProjects",
  "getProject",
  "importProject",
  "renameProject",
  "deleteProject",
  "queryProject",
  "updateTranslation",
  "getTranslationHistory",
  "copyText",
  "exportProject",
  "openExportDirectory",
  "backupDatabase",
  "restoreDatabase",
  "openDataDirectory",
  "getAiSettings",
  "saveDeepSeekKey",
  "verifyDeepSeekConnection",
  "deleteDeepSeekKey",
  "listAiSessions",
  "createAiSession",
  "renameAiSession",
  "deleteAiSession",
  "listAiMessages",
  "sendAiMessage",
  "stopAiMessage",
  "retryAiMessage",
  "listAiAuditJobs",
  "startAiAudit",
  "pauseAiAudit",
  "resumeAiAudit",
  "listAiAuditFindings",
  "decideAiAuditFinding",
  "acceptAllAiAuditFindings",
  "applyAiAudit",
  "getAiAuditDefaults",
  "saveAiAuditDefaults",
  "listAiAgentRevisions",
  "updateAiAgentRevision",
  "applyAiAgentRevisions",
  "ignoreAiAgentRevision",
  "confirmAppClose",
] as const satisfies ReadonlyArray<keyof TmxDesktopApi>;

describe("desktop IPC contract", () => {
  it("maps every request method to one namespaced IPC channel", () => {
    expect(Object.keys(IPC_CHANNELS.requests).sort())
      .toEqual([...METHOD_NAMES].sort());
    expect(new Set(Object.values(IPC_CHANNELS.requests)).size)
      .toBe(METHOD_NAMES.length);
    expect(Object.values(IPC_CHANNELS.requests).every((channel) => (
      channel.startsWith("tmx-workbench:")
    ))).toBe(true);
  });

  it("forwards methods through invoke without exposing the raw renderer", async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const on = vi.fn();
    const removeListener = vi.fn();
    const api = createDesktopApi({ invoke, on, removeListener });
    const query = {
      projectId: "project-1",
      filters: {
        query: "alarm",
        targetLanguage: "en-US",
        status: "changed" as const,
        duplicateOnly: true,
      },
      page: 2,
      pageSize: 100 as const,
    };

    await api.listProjects();
    await api.getProject("project-1");
    await api.importProject();
    await api.renameProject("project-1", "Manual");
    await api.deleteProject("project-1");
    await api.queryProject(query);
    await api.updateTranslation("project-1", "row-1", {
      sourceText: "Source",
      targetText: "Updated",
    });
    await api.getTranslationHistory("project-1", "row-1");
    await api.copyText("Copied text");
    await api.exportProject("project-1", query.filters);
    await api.openExportDirectory("/exports/manual.xlsx");
    await api.backupDatabase();
    await api.restoreDatabase();
    await api.openDataDirectory();
    await api.getAiSettings();
    await api.saveDeepSeekKey("sk-secret");
    await api.verifyDeepSeekConnection();
    await api.deleteDeepSeekKey();
    await api.listAiSessions("project-1");
    await api.createAiSession("project-1", "新会话");
    await api.renameAiSession("session-1", "新名称");
    await api.deleteAiSession("session-1");
    await api.listAiMessages("session-1");
    await api.sendAiMessage("session-1", "main", "检查术语");
    await api.stopAiMessage("session-1");
    await api.retryAiMessage("session-1", "main");
    await api.listAiAuditJobs("project-1");
    await api.startAiAudit("project-1", query.filters, {
      customRules: "统一术语",
      minConfidence: 0.8,
      allowRewrite: true,
      concurrency: 8,
    });
    await api.pauseAiAudit("audit-1");
    await api.resumeAiAudit("audit-1");
    await api.listAiAuditFindings("audit-1");
    await api.decideAiAuditFinding("finding-1", "edited", "Edited target");
    await api.acceptAllAiAuditFindings("audit-1");
    await api.applyAiAudit("audit-1");
    await api.getAiAuditDefaults();
    await api.saveAiAuditDefaults({
      customRules: "统一术语",
      minConfidence: 0.8,
      allowRewrite: true,
      concurrency: 8,
    });
    await api.listAiAgentRevisions("session-1");
    await api.updateAiAgentRevision("rev-1", "Edited suggestion");
    await api.applyAiAgentRevisions("session-1", ["rev-1"]);
    await api.ignoreAiAgentRevision("rev-1");
    await api.confirmAppClose();

    expect(invoke.mock.calls).toEqual([
      [IPC_CHANNELS.requests.listProjects],
      [IPC_CHANNELS.requests.getProject, "project-1"],
      [IPC_CHANNELS.requests.importProject],
      [IPC_CHANNELS.requests.renameProject, "project-1", "Manual"],
      [IPC_CHANNELS.requests.deleteProject, "project-1"],
      [IPC_CHANNELS.requests.queryProject, query],
      [IPC_CHANNELS.requests.updateTranslation, "project-1", "row-1", {
        sourceText: "Source",
        targetText: "Updated",
      }],
      [IPC_CHANNELS.requests.getTranslationHistory, "project-1", "row-1"],
      [IPC_CHANNELS.requests.copyText, "Copied text"],
      [IPC_CHANNELS.requests.exportProject, "project-1", query.filters],
      [IPC_CHANNELS.requests.openExportDirectory, "/exports/manual.xlsx"],
      [IPC_CHANNELS.requests.backupDatabase],
      [IPC_CHANNELS.requests.restoreDatabase],
      [IPC_CHANNELS.requests.openDataDirectory],
      [IPC_CHANNELS.requests.getAiSettings],
      [IPC_CHANNELS.requests.saveDeepSeekKey, "sk-secret"],
      [IPC_CHANNELS.requests.verifyDeepSeekConnection],
      [IPC_CHANNELS.requests.deleteDeepSeekKey],
      [IPC_CHANNELS.requests.listAiSessions, "project-1"],
      [IPC_CHANNELS.requests.createAiSession, "project-1", "新会话"],
      [IPC_CHANNELS.requests.renameAiSession, "session-1", "新名称"],
      [IPC_CHANNELS.requests.deleteAiSession, "session-1"],
      [IPC_CHANNELS.requests.listAiMessages, "session-1", "main"],
      [IPC_CHANNELS.requests.sendAiMessage, "session-1", "main", "检查术语"],
      [IPC_CHANNELS.requests.stopAiMessage, "session-1"],
      [IPC_CHANNELS.requests.retryAiMessage, "session-1", "main"],
      [IPC_CHANNELS.requests.listAiAuditJobs, "project-1"],
      [IPC_CHANNELS.requests.startAiAudit, "project-1", query.filters, {
        customRules: "统一术语",
        minConfidence: 0.8,
        allowRewrite: true,
        concurrency: 8,
      }],
      [IPC_CHANNELS.requests.pauseAiAudit, "audit-1"],
      [IPC_CHANNELS.requests.resumeAiAudit, "audit-1"],
      [IPC_CHANNELS.requests.listAiAuditFindings, "audit-1"],
      [IPC_CHANNELS.requests.decideAiAuditFinding, "finding-1", "edited", "Edited target"],
      [IPC_CHANNELS.requests.acceptAllAiAuditFindings, "audit-1"],
      [IPC_CHANNELS.requests.applyAiAudit, "audit-1"],
      [IPC_CHANNELS.requests.getAiAuditDefaults],
      [IPC_CHANNELS.requests.saveAiAuditDefaults, {
        customRules: "统一术语",
        minConfidence: 0.8,
        allowRewrite: true,
        concurrency: 8,
      }],
      [IPC_CHANNELS.requests.listAiAgentRevisions, "session-1"],
      [IPC_CHANNELS.requests.updateAiAgentRevision, "rev-1", "Edited suggestion"],
      [IPC_CHANNELS.requests.applyAiAgentRevisions, "session-1", ["rev-1"]],
      [IPC_CHANNELS.requests.ignoreAiAgentRevision, "rev-1"],
      [IPC_CHANNELS.requests.confirmAppClose],
    ]);
  });

  it("returns unsubscribe functions for import and export progress", () => {
    const invoke = vi.fn();
    const on = vi.fn();
    const removeListener = vi.fn();
    const api = createDesktopApi({ invoke, on, removeListener });
    const importListener = vi.fn<(progress: ImportProgress) => void>();
    const exportListener = vi.fn<(progress: ExportProgress) => void>();

    const unsubscribeImport = api.onImportProgress(importListener);
    const unsubscribeExport = api.onExportProgress(exportListener);
    const closeListener = vi.fn();
    const unsubscribeClose = api.onAppCloseRequested(closeListener);
    const agentListener = vi.fn();
    const unsubscribeAgent = api.onAiAgentEvent(agentListener);
    const auditListener = vi.fn();
    const unsubscribeAudit = api.onAiAuditEvent(auditListener);

    expect(on).toHaveBeenCalledTimes(5);
    expect(typeof unsubscribeImport).toBe("function");
    expect(typeof unsubscribeExport).toBe("function");

    const importWrapper = on.mock.calls[0][1];
    const exportWrapper = on.mock.calls[1][1];
    const closeWrapper = on.mock.calls[2][1];
    const agentWrapper = on.mock.calls[3][1];
    const auditWrapper = on.mock.calls[4][1];
    const importProgress = { operationId: "i" } as ImportProgress;
    const exportProgress = { operationId: "e" } as ExportProgress;
    importWrapper({}, importProgress);
    exportWrapper({}, exportProgress);
    expect(importListener).toHaveBeenCalledWith(importProgress);
    expect(exportListener).toHaveBeenCalledWith(exportProgress);
    closeWrapper({});
    expect(closeListener).toHaveBeenCalledTimes(1);
    const agentEvent = { sessionId: "session-1", event: { type: "text-delta", delta: "A" } };
    agentWrapper({}, agentEvent);
    expect(agentListener).toHaveBeenCalledWith(agentEvent);
    const auditEvent = { jobId: "audit-1", event: { type: "finding", count: 1 } };
    auditWrapper({}, auditEvent);
    expect(auditListener).toHaveBeenCalledWith(auditEvent);

    unsubscribeImport();
    unsubscribeExport();
    unsubscribeClose();
    unsubscribeAgent();
    unsubscribeAudit();
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.events.importProgress,
      importWrapper,
    );
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.events.exportProgress,
      exportWrapper,
    );
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.events.appCloseRequested,
      closeWrapper,
    );
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.events.aiAgentEvent,
      agentWrapper,
    );
    expect(removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.events.aiAuditEvent,
      auditWrapper,
    );
  });
});
