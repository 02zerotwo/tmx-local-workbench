import type { TmxDesktopApi } from "../../src/lib/desktop-types";

type EventMethodName =
  | "onImportProgress"
  | "onExportProgress"
  | "onAppCloseRequested";
type RequestMethodName = Exclude<keyof TmxDesktopApi, EventMethodName>;

export const IPC_CHANNELS = {
  requests: {
    listProjects: "tmx-workbench:projects:list",
    getProject: "tmx-workbench:projects:get",
    importProject: "tmx-workbench:projects:import",
    renameProject: "tmx-workbench:projects:rename",
    deleteProject: "tmx-workbench:projects:delete",
    queryProject: "tmx-workbench:units:query",
    updateTranslation: "tmx-workbench:units:update",
    getTranslationHistory: "tmx-workbench:units:history",
    copyText: "tmx-workbench:clipboard:copy-text",
    exportProject: "tmx-workbench:projects:export",
    openExportDirectory: "tmx-workbench:projects:open-export-directory",
    backupDatabase: "tmx-workbench:database:backup",
    restoreDatabase: "tmx-workbench:database:restore",
    openDataDirectory: "tmx-workbench:database:open-directory",
    confirmAppClose: "tmx-workbench:application:confirm-close",
  } satisfies Record<RequestMethodName, string>,
  events: {
    importProgress: "tmx-workbench:progress:import",
    exportProgress: "tmx-workbench:progress:export",
    appCloseRequested: "tmx-workbench:application:close-requested",
  },
} as const;
