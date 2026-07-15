import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { DatabaseBackupService } from "./database/backup-service";
import { resolveDatabasePath } from "./database/connection";
import { ProjectRepository } from "./database/project-repository";
import { UnitRepository } from "./database/unit-repository";
import { exportProjectToExcel } from "./export/excel-export-service";
import { registerDesktopHandlers } from "./ipc/register-handlers";
import {
  createMainWindow,
  protectUnsavedChanges,
  type WindowCloseController,
} from "./window";

let databaseService: DatabaseBackupService | undefined;
let mainWindow: BrowserWindow | undefined;
let closeController: WindowCloseController | undefined;

function ensureWritableDirectory(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function startApplication(): Promise<void> {
  const portableDataDirectory = join(dirname(process.execPath), "data");
  const userDataDirectory = join(app.getPath("userData"), "data");
  const databasePath = resolveDatabasePath({
    portableDataDirectory: app.isPackaged ? portableDataDirectory : undefined,
    portableDataDirectoryWritable: app.isPackaged
      && ensureWritableDirectory(portableDataDirectory),
    userDataDirectory,
  });
  databaseService = new DatabaseBackupService({ databasePath });
  registerDataHandlers(databasePath);
  mainWindow = await createMainWindow();
  closeController = protectUnsavedChanges(mainWindow);
  mainWindow.once("closed", () => {
    closeController?.dispose();
    closeController = undefined;
    mainWindow = undefined;
  });
}

function registerDataHandlers(databasePath: string): void {
  if (!databaseService) {
    throw new Error("Database service is not initialized");
  }

  const projectRepository = new ProjectRepository(databaseService.database);
  const unitRepository = new UnitRepository(databaseService.database);

  registerDesktopHandlers({
    ipcMain,
    dialog,
    shell,
    clipboard,
    databasePath,
    projectRepository,
    unitRepository,
    exportProject: ({
      projectId,
      filters,
      suggestedFilePath,
      operationId,
      onProgress,
    }) => exportProjectToExcel({
      projectId,
      filters,
      outputPath: suggestedFilePath,
      operationId,
      unitRepository,
      onProgress,
    }),
    backupDatabase: (suggestedFilePath) => (
      Promise.resolve(databaseService!.backup(suggestedFilePath))
    ),
    restoreDatabase: async (backupPath) => {
      try {
        databaseService!.restore(backupPath);
        return true;
      } finally {
        registerDataHandlers(databasePath);
      }
    },
    isTrustedSender: (event) => event.sender === mainWindow?.webContents,
    confirmAppClose: () => closeController?.confirm(),
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(startApplication).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("TMX Workbench failed to start", error);
    void dialog.showErrorBox("TMX 工作台启动失败", message);
    app.quit();
  });
}

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  databaseService?.close();
  databaseService = undefined;
});
