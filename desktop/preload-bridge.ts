import type {
  ExportProgress,
  ImportProgress,
  TmxDesktopApi,
} from "../src/lib/desktop-types";
import { IPC_CHANNELS } from "./ipc/channels";

type RendererListener = (event: unknown, payload: unknown) => void;

export type IpcRendererBridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: RendererListener) => unknown;
  removeListener: (channel: string, listener: RendererListener) => unknown;
};

export function createDesktopApi(ipcRenderer: IpcRendererBridge): TmxDesktopApi {
  const subscribe = <Progress>(
    channel: string,
    listener: (progress: Progress) => void,
  ) => {
    const wrapper: RendererListener = (_event, payload) => {
      listener(payload as Progress);
    };
    ipcRenderer.on(channel, wrapper);
    return () => ipcRenderer.removeListener(channel, wrapper);
  };

  return {
    listProjects: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listProjects,
    ) as ReturnType<TmxDesktopApi["listProjects"]>,
    getProject: (projectId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.getProject,
      projectId,
    ) as ReturnType<TmxDesktopApi["getProject"]>,
    importProject: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.importProject,
    ) as ReturnType<TmxDesktopApi["importProject"]>,
    renameProject: (projectId, name) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.renameProject,
      projectId,
      name,
    ) as ReturnType<TmxDesktopApi["renameProject"]>,
    deleteProject: (projectId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.deleteProject,
      projectId,
    ) as ReturnType<TmxDesktopApi["deleteProject"]>,
    queryProject: (query) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.queryProject,
      query,
    ) as ReturnType<TmxDesktopApi["queryProject"]>,
    updateTranslation: (projectId, rowId, changes) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.updateTranslation,
      projectId,
      rowId,
      changes,
    ) as ReturnType<TmxDesktopApi["updateTranslation"]>,
    getTranslationHistory: (projectId, rowId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.getTranslationHistory,
      projectId,
      rowId,
    ) as ReturnType<TmxDesktopApi["getTranslationHistory"]>,
    copyText: (text) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.copyText,
      text,
    ) as ReturnType<TmxDesktopApi["copyText"]>,
    exportProject: (projectId, filters) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.exportProject,
      projectId,
      filters,
    ) as ReturnType<TmxDesktopApi["exportProject"]>,
    openExportDirectory: (filePath) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.openExportDirectory,
      filePath,
    ) as ReturnType<TmxDesktopApi["openExportDirectory"]>,
    backupDatabase: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.backupDatabase,
    ) as ReturnType<TmxDesktopApi["backupDatabase"]>,
    restoreDatabase: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.restoreDatabase,
    ) as ReturnType<TmxDesktopApi["restoreDatabase"]>,
    openDataDirectory: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.openDataDirectory,
    ) as ReturnType<TmxDesktopApi["openDataDirectory"]>,
    confirmAppClose: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.confirmAppClose,
    ) as ReturnType<TmxDesktopApi["confirmAppClose"]>,
    onImportProgress: (listener: (progress: ImportProgress) => void) => (
      subscribe(IPC_CHANNELS.events.importProgress, listener)
    ),
    onExportProgress: (listener: (progress: ExportProgress) => void) => (
      subscribe(IPC_CHANNELS.events.exportProgress, listener)
    ),
    onAppCloseRequested: (listener) => (
      subscribe(IPC_CHANNELS.events.appCloseRequested, listener)
    ),
  };
}
