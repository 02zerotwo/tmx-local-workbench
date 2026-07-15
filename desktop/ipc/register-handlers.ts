import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Clipboard,
  IpcMain,
  IpcMainInvokeEvent,
  OpenDialogOptions,
  SaveDialogOptions,
} from "electron";
import type {
  ExportProgress,
  ProjectFilters,
  ProjectPageSize,
  ProjectQuery,
} from "../../src/lib/desktop-types";
import { PROJECT_PAGE_SIZES } from "../../src/lib/desktop-types";
import type { ProjectRepository } from "../database/project-repository";
import type { UnitRepository } from "../database/unit-repository";
import { importTmxProject } from "../import/import-service";
import { IPC_CHANNELS } from "./channels";

type DialogAdapter = {
  showOpenDialog: (options: OpenDialogOptions) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
};

type ShellAdapter = {
  openPath: (path: string) => Promise<string>;
};

type ClipboardAdapter = Pick<Clipboard, "writeText">;

export type ExportProjectOperation = (input: {
  projectId: string;
  filters?: ProjectFilters;
  suggestedFilePath: string;
  operationId: string;
  onProgress: (progress: ExportProgress) => void;
}) => Promise<string>;

export type DesktopHandlerDependencies = {
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">;
  dialog: DialogAdapter;
  shell: ShellAdapter;
  clipboard: ClipboardAdapter;
  databasePath: string;
  projectRepository: ProjectRepository;
  unitRepository: UnitRepository;
  exportProject?: ExportProjectOperation;
  backupDatabase?: (suggestedFilePath: string) => Promise<string>;
  restoreDatabase?: (backupPath: string) => Promise<boolean>;
  now?: () => Date;
  pathExists?: (path: string) => boolean;
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
  confirmAppClose: () => void;
};

type PlainRecord = Record<string, unknown>;

const FILTER_STATUSES = ["all", "empty", "changed"] as const;

function plainRecord(value: unknown, label: string): PlainRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 参数无效`);
  }

  return value as PlainRecord;
}

function requiredString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} 参数无效`);
  }

  return value;
}

function parseFilters(value: unknown): ProjectFilters {
  const filters = plainRecord(value, "筛选条件");
  const status = requiredString(filters.status, "状态");

  if (!FILTER_STATUSES.includes(status as (typeof FILTER_STATUSES)[number])) {
    throw new Error("状态筛选参数无效");
  }

  if (typeof filters.duplicateOnly !== "boolean") {
    throw new Error("重复项筛选参数无效");
  }

  return {
    query: requiredString(filters.query, "搜索文字", true),
    targetLanguage: requiredString(filters.targetLanguage, "目标语言", true),
    status: status as ProjectFilters["status"],
    duplicateOnly: filters.duplicateOnly,
  };
}

function parseProjectQuery(value: unknown): ProjectQuery {
  const query = plainRecord(value, "项目查询");

  if (!Number.isSafeInteger(query.page) || Number(query.page) < 1) {
    throw new Error("页码参数无效");
  }

  if (!(PROJECT_PAGE_SIZES as readonly unknown[]).includes(query.pageSize)) {
    throw new Error("每页数量参数无效");
  }

  return {
    projectId: requiredString(query.projectId, "项目 ID"),
    filters: parseFilters(query.filters),
    page: Number(query.page),
    pageSize: query.pageSize as ProjectPageSize,
  };
}

function parseTranslationUpdate(value: unknown): {
  sourceText: string;
  targetText: string;
} {
  const update = plainRecord(value, "翻译内容");
  return {
    sourceText: requiredString(update.sourceText, "源文本", true),
    targetText: requiredString(update.targetText, "目标文本", true),
  };
}

function sendProgress(
  event: IpcMainInvokeEvent,
  channel: string,
  progress: unknown,
): void {
  if (!event.sender.isDestroyed()) {
    event.sender.send(channel, progress);
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/[. ]+$/g, "");

  return sanitized || "TMX 项目";
}

function availableExportPath(
  directoryPath: string,
  baseName: string,
  pathExists: (path: string) => boolean,
): string {
  let suffix = 1;
  let candidatePath = join(directoryPath, `${baseName}.xlsx`);

  while (pathExists(candidatePath)) {
    suffix += 1;
    candidatePath = join(directoryPath, `${baseName} (${suffix}).xlsx`);
  }

  return candidatePath;
}

function register(
  dependencies: DesktopHandlerDependencies,
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  dependencies.ipcMain.removeHandler(channel);
  dependencies.ipcMain.handle(channel, handler);
}

export function registerDesktopHandlers(
  dependencies: DesktopHandlerDependencies,
): void {
  const { requests, events } = IPC_CHANNELS;

  register(dependencies, requests.listProjects, () => (
    dependencies.projectRepository.listProjects()
  ));
  register(dependencies, requests.getProject, (_event, projectId) => (
    dependencies.projectRepository.getProject(requiredString(projectId, "项目 ID"))
  ));
  register(dependencies, requests.renameProject, (_event, projectId, name) => (
    dependencies.projectRepository.renameProject(
      requiredString(projectId, "项目 ID"),
      requiredString(name, "项目名称"),
    )
  ));
  register(dependencies, requests.deleteProject, (_event, projectId) => {
    dependencies.projectRepository.deleteProject(requiredString(projectId, "项目 ID"));
  });
  register(dependencies, requests.queryProject, (_event, query) => (
    dependencies.unitRepository.queryProject(parseProjectQuery(query))
  ));
  register(
    dependencies,
    requests.updateTranslation,
    (_event, projectId, rowId, update) => (
      dependencies.unitRepository.updateTranslation(
        requiredString(projectId, "项目 ID"),
        requiredString(rowId, "翻译行 ID"),
        parseTranslationUpdate(update),
      )
    ),
  );
  register(
    dependencies,
    requests.getTranslationHistory,
    (_event, projectId, rowId) => (
      dependencies.unitRepository.getTranslationHistory(
        requiredString(projectId, "项目 ID"),
        requiredString(rowId, "翻译行 ID"),
      )
    ),
  );
  register(dependencies, requests.copyText, (event, text) => {
    if (!dependencies.isTrustedSender(event)) {
      throw new Error("拒绝来自不受信任页面的剪贴板请求");
    }
    dependencies.clipboard.writeText(requiredString(text, "复制文本", true));
  });
  register(dependencies, requests.importProject, async (event) => {
    const selection = await dependencies.dialog.showOpenDialog({
      title: "导入 TMX 文件",
      properties: ["openFile"],
      filters: [{ name: "TMX 翻译文件", extensions: ["tmx"] }],
    });
    const filePath = selection.filePaths[0];
    if (selection.canceled || !filePath) {
      return null;
    }

    return importTmxProject({
      filePath,
      operationId: randomUUID(),
      projectRepository: dependencies.projectRepository,
      unitRepository: dependencies.unitRepository,
      onProgress: (progress) => sendProgress(event, events.importProgress, progress),
    });
  });
  register(dependencies, requests.exportProject, async (event, projectId, filters) => {
    if (!dependencies.exportProject) {
      throw new Error("Excel 导出功能尚未就绪");
    }

    const id = requiredString(projectId, "项目 ID");
    const project = dependencies.projectRepository.getProject(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }
    const parsedFilters = filters === undefined ? undefined : parseFilters(filters);
    const selection = await dependencies.dialog.showOpenDialog({
      title: "选择 Excel 导出文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    const directoryPath = selection.filePaths[0];
    if (selection.canceled || !directoryPath) {
      return null;
    }

    const date = formatLocalDate((dependencies.now ?? (() => new Date()))());
    const baseName = `${sanitizeFileName(project.name)}-${date}`;
    const suggestedFilePath = availableExportPath(
      directoryPath,
      baseName,
      dependencies.pathExists ?? existsSync,
    );
    const operationId = randomUUID();
    return dependencies.exportProject({
      projectId: id,
      filters: parsedFilters,
      suggestedFilePath,
      operationId,
      onProgress: (progress) => sendProgress(event, events.exportProgress, progress),
    });
  });
  register(dependencies, requests.openExportDirectory, async (_event, filePath) => {
    const directoryPath = dirname(requiredString(filePath, "导出文件路径"));
    const error = await dependencies.shell.openPath(directoryPath);
    if (error) {
      throw new Error(`无法打开导出目录：${error}`);
    }
  });
  register(dependencies, requests.backupDatabase, async () => {
    if (!dependencies.backupDatabase) {
      throw new Error("数据库备份功能尚未就绪");
    }
    const selection = await dependencies.dialog.showSaveDialog({
      title: "备份项目数据库",
      defaultPath: `tmx-workbench-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
    });
    if (selection.canceled || !selection.filePath) {
      return null;
    }

    return dependencies.backupDatabase(selection.filePath);
  });
  register(dependencies, requests.restoreDatabase, async () => {
    if (!dependencies.restoreDatabase) {
      throw new Error("数据库恢复功能尚未就绪");
    }
    const selection = await dependencies.dialog.showOpenDialog({
      title: "恢复项目数据库",
      properties: ["openFile"],
      filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
    });
    const backupPath = selection.filePaths[0];
    if (selection.canceled || !backupPath) {
      return false;
    }

    return dependencies.restoreDatabase(backupPath);
  });
  register(dependencies, requests.openDataDirectory, async () => {
    const error = await dependencies.shell.openPath(dirname(dependencies.databasePath));
    if (error) {
      throw new Error(`无法打开数据目录：${error}`);
    }
  });
  register(dependencies, requests.confirmAppClose, () => {
    dependencies.confirmAppClose();
  });
}
