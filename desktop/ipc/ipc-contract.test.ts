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

    expect(on).toHaveBeenCalledTimes(3);
    expect(typeof unsubscribeImport).toBe("function");
    expect(typeof unsubscribeExport).toBe("function");

    const importWrapper = on.mock.calls[0][1];
    const exportWrapper = on.mock.calls[1][1];
    const closeWrapper = on.mock.calls[2][1];
    const importProgress = { operationId: "i" } as ImportProgress;
    const exportProgress = { operationId: "e" } as ExportProgress;
    importWrapper({}, importProgress);
    exportWrapper({}, exportProgress);
    expect(importListener).toHaveBeenCalledWith(importProgress);
    expect(exportListener).toHaveBeenCalledWith(exportProgress);
    closeWrapper({});
    expect(closeListener).toHaveBeenCalledTimes(1);

    unsubscribeImport();
    unsubscribeExport();
    unsubscribeClose();
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
  });
});
