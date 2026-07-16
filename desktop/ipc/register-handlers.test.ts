// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import type { ProjectRepository } from "../database/project-repository";
import type { UnitRepository } from "../database/unit-repository";
import { IPC_CHANNELS } from "./channels";
import { registerDesktopHandlers } from "./register-handlers";

const PROJECT_DETAIL = {
  id: "project-1",
  name: "User manual",
  fileName: "manual.tmx",
  sourceLanguage: "zh-CN",
  targetLanguages: ["en-US"],
  totalUnits: 10,
  changedUnits: 2,
  emptyUnits: 1,
  skippedUnits: 0,
  importStatus: "ready" as const,
  fileSize: 1024,
  importedAt: "2026-07-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

type HarnessOptions = {
  projectName?: string;
  openDialogResult?: { canceled: boolean; filePaths: string[] };
  pathExists?: (path: string) => boolean;
  trustedSender?: boolean;
};

function createHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const queryProject = vi.fn();
  const updateTranslation = vi.fn();
  const getTranslationHistory = vi.fn(() => []);
  const copyText = vi.fn();
  const openPath = vi.fn(async () => "");
  const showOpenDialog = vi.fn(async () => (
    options.openDialogResult ?? { canceled: true, filePaths: [] }
  ));
  const showSaveDialog = vi.fn(async () => ({ canceled: true }));
  const exportProject = vi.fn(async ({ suggestedFilePath }) => suggestedFilePath);
  const projectRepository = {
    listProjects: vi.fn(() => []),
    getProject: vi.fn(() => ({
      ...PROJECT_DETAIL,
      name: options.projectName ?? PROJECT_DETAIL.name,
    })),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
  } as unknown as ProjectRepository;
  const unitRepository = {
    queryProject,
    updateTranslation,
    getTranslationHistory,
  } as unknown as UnitRepository;

  registerDesktopHandlers({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler as (...args: unknown[]) => unknown);
      },
      removeHandler: vi.fn(),
    },
    dialog: {
      showOpenDialog,
      showSaveDialog,
    },
    shell: { openPath },
    clipboard: { writeText: copyText },
    databasePath: "/tmp/tmx-workbench.db",
    projectRepository,
    unitRepository,
    exportProject,
    now: () => new Date("2026-07-14T09:30:00.000Z"),
    pathExists: options.pathExists ?? (() => false),
    isTrustedSender: () => options.trustedSender ?? true,
    confirmAppClose: vi.fn(),
  });

  const event = {
    sender: {
      isDestroyed: () => false,
      send: vi.fn(),
    },
  } as unknown as IpcMainInvokeEvent;

  return {
    event,
    handlers,
    queryProject,
    updateTranslation,
    getTranslationHistory,
    copyText,
    openPath,
    showOpenDialog,
    showSaveDialog,
    exportProject,
  };
}

describe("registerDesktopHandlers", () => {
  it("registers every request channel", () => {
    const { handlers } = createHarness();
    expect([...handlers.keys()].sort())
      .toEqual(Object.values(IPC_CHANNELS.requests).sort());
  });

  it("validates a complete project query before calling the repository", () => {
    const { event, handlers, queryProject } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.queryProject)!;
    const validQuery = {
      projectId: "project-1",
      filters: {
        query: "alarm",
        targetLanguage: "en-US",
        status: "changed",
        duplicateOnly: true,
      },
      page: 2,
      pageSize: 100,
    };

    handler(event, validQuery);
    expect(queryProject).toHaveBeenCalledWith(validQuery);

    expect(() => handler(event, { ...validQuery, pageSize: 50 }))
      .toThrow(/每页数量/);
    expect(() => handler(event, {
      ...validQuery,
      filters: { ...validQuery.filters, status: "deleted" },
    })).toThrow(/状态筛选/);
    expect(queryProject).toHaveBeenCalledTimes(1);
  });

  it("validates a complete source and target update before calling the repository", () => {
    const { event, handlers, updateTranslation } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.updateTranslation)!;

    handler(event, "project-1", "row-1", { sourceText: "Source", targetText: "" });
    expect(updateTranslation).toHaveBeenCalledWith("project-1", "row-1", {
      sourceText: "Source",
      targetText: "",
    });
    expect(() => handler(event, "project-1", "row-1", { sourceText: {}, targetText: "" }))
      .toThrow(/源文本/);
    expect(() => handler(event, "project-1", "row-1", { sourceText: "Source" }))
      .toThrow(/目标文本/);
    expect(updateTranslation).toHaveBeenCalledTimes(1);
  });

  it("copies renderer text through the operating-system clipboard adapter", () => {
    const { copyText, event, handlers } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.copyText)!;

    handler(event, "Copied text");
    expect(copyText).toHaveBeenCalledWith("Copied text");
    expect(() => handler(event, { text: "bad" })).toThrow(/复制文本/);
    expect(copyText).toHaveBeenCalledTimes(1);
  });

  it("rejects clipboard writes from an untrusted renderer", () => {
    const { copyText, event, handlers } = createHarness({ trustedSender: false });
    const handler = handlers.get(IPC_CHANNELS.requests.copyText)!;

    expect(() => handler(event, "Injected text")).toThrow(/不受信任/);
    expect(copyText).not.toHaveBeenCalled();
  });

  it("validates translation history identifiers before querying the repository", () => {
    const { event, handlers, getTranslationHistory } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.getTranslationHistory)!;

    handler(event, "project-1", "row-1");
    expect(getTranslationHistory).toHaveBeenCalledWith("project-1", "row-1");
    expect(() => handler(event, "", "row-1")).toThrow(/项目 ID/);
    expect(() => handler(event, "project-1", "   ")).toThrow(/翻译行 ID/);
    expect(getTranslationHistory).toHaveBeenCalledTimes(1);
  });

  it("opens the directory containing an exported file", async () => {
    const { event, handlers, openPath } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.openExportDirectory)!;

    await handler(event, "/exports/manual.xlsx");
    expect(openPath).toHaveBeenCalledWith("/exports");
    await expect(handler(event, "   ")).rejects.toThrow(/导出文件路径/);
    expect(openPath).toHaveBeenCalledTimes(1);
  });

  it("reports an operating-system error when the export directory cannot open", async () => {
    const { event, handlers, openPath } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.openExportDirectory)!;
    openPath.mockResolvedValueOnce("permission denied");

    await expect(handler(event, "/exports/manual.xlsx"))
      .rejects.toThrow("无法打开导出目录：permission denied");
  });

  it("returns null when export directory selection is canceled", async () => {
    const { event, handlers, showOpenDialog, exportProject } = createHarness();
    const handler = handlers.get(IPC_CHANNELS.requests.exportProject)!;

    await expect(handler(event, "project-1")).resolves.toBeNull();
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: "选择 Excel 导出文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    expect(exportProject).not.toHaveBeenCalled();
  });

  it("exports into the selected directory using project name and current date", async () => {
    const { event, handlers, exportProject, showSaveDialog } = createHarness({
      openDialogResult: { canceled: false, filePaths: ["/exports"] },
    });
    const handler = handlers.get(IPC_CHANNELS.requests.exportProject)!;

    await expect(handler(event, "project-1")).resolves.toBe(
      join("/exports", "User manual-2026-07-14.xlsx"),
    );
    expect(exportProject).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      suggestedFilePath: join("/exports", "User manual-2026-07-14.xlsx"),
    }));
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it("removes invalid filename characters and trailing dots or spaces", async () => {
    const { event, handlers, exportProject } = createHarness({
      projectName: "Manual<>:\"/\\|?*...   ",
      openDialogResult: { canceled: false, filePaths: ["/exports"] },
    });
    const handler = handlers.get(IPC_CHANNELS.requests.exportProject)!;

    await handler(event, "project-1");
    expect(exportProject).toHaveBeenCalledWith(expect.objectContaining({
      suggestedFilePath: join("/exports", "Manual_-2026-07-14.xlsx"),
    }));
  });

  it("appends an incrementing suffix until the export filename is available", async () => {
    const existingPaths = new Set([
      join("/exports", "User manual-2026-07-14.xlsx"),
      join("/exports", "User manual-2026-07-14 (2).xlsx"),
    ]);
    const pathExists = vi.fn((path: string) => existingPaths.has(path));
    const { event, handlers, exportProject } = createHarness({
      openDialogResult: { canceled: false, filePaths: ["/exports"] },
      pathExists,
    });
    const handler = handlers.get(IPC_CHANNELS.requests.exportProject)!;

    await handler(event, "project-1");
    expect(pathExists).toHaveBeenCalledTimes(3);
    expect(exportProject).toHaveBeenCalledWith(expect.objectContaining({
      suggestedFilePath: join("/exports", "User manual-2026-07-14 (3).xlsx"),
    }));
  });
});
