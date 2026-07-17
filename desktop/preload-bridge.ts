import type {
  ExportProgress,
  ImportProgress,
  AiAgentEvent,
  AiAuditEvent,
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
    getAiSettings: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.getAiSettings,
    ) as ReturnType<TmxDesktopApi["getAiSettings"]>,
    saveDeepSeekKey: (apiKey) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.saveDeepSeekKey,
      apiKey,
    ) as ReturnType<TmxDesktopApi["saveDeepSeekKey"]>,
    verifyDeepSeekConnection: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.verifyDeepSeekConnection,
    ) as ReturnType<TmxDesktopApi["verifyDeepSeekConnection"]>,
    deleteDeepSeekKey: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.deleteDeepSeekKey,
    ) as ReturnType<TmxDesktopApi["deleteDeepSeekKey"]>,
    listAiSessions: (projectId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listAiSessions,
      projectId,
    ) as ReturnType<TmxDesktopApi["listAiSessions"]>,
    createAiSession: (projectId, title) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.createAiSession,
      projectId,
      title,
    ) as ReturnType<TmxDesktopApi["createAiSession"]>,
    renameAiSession: (sessionId, title) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.renameAiSession,
      sessionId,
      title,
    ) as ReturnType<TmxDesktopApi["renameAiSession"]>,
    deleteAiSession: (sessionId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.deleteAiSession,
      sessionId,
    ) as ReturnType<TmxDesktopApi["deleteAiSession"]>,
    listAiMessages: (sessionId, branchId = "main") => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listAiMessages,
      sessionId,
      branchId,
    ) as ReturnType<TmxDesktopApi["listAiMessages"]>,
    sendAiMessage: (sessionId, branchId, content) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.sendAiMessage,
      sessionId,
      branchId,
      content,
    ) as ReturnType<TmxDesktopApi["sendAiMessage"]>,
    stopAiMessage: (sessionId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.stopAiMessage,
      sessionId,
    ) as ReturnType<TmxDesktopApi["stopAiMessage"]>,
    retryAiMessage: (sessionId, branchId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.retryAiMessage,
      sessionId,
      branchId,
    ) as ReturnType<TmxDesktopApi["retryAiMessage"]>,
    listAiAuditJobs: (projectId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listAiAuditJobs,
      projectId,
    ) as ReturnType<TmxDesktopApi["listAiAuditJobs"]>,
    startAiAudit: (projectId, filters, boundaries) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.startAiAudit,
      projectId,
      filters,
      boundaries,
    ) as ReturnType<TmxDesktopApi["startAiAudit"]>,
    pauseAiAudit: (jobId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.pauseAiAudit,
      jobId,
    ) as ReturnType<TmxDesktopApi["pauseAiAudit"]>,
    resumeAiAudit: (jobId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.resumeAiAudit,
      jobId,
    ) as ReturnType<TmxDesktopApi["resumeAiAudit"]>,
    listAiAuditFindings: (jobId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listAiAuditFindings,
      jobId,
    ) as ReturnType<TmxDesktopApi["listAiAuditFindings"]>,
    decideAiAuditFinding: (findingId, decision, editedTargetText) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.decideAiAuditFinding,
      findingId,
      decision,
      editedTargetText,
    ) as ReturnType<TmxDesktopApi["decideAiAuditFinding"]>,
    acceptAllAiAuditFindings: (jobId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.acceptAllAiAuditFindings,
      jobId,
    ) as ReturnType<TmxDesktopApi["acceptAllAiAuditFindings"]>,
    applyAiAudit: (jobId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.applyAiAudit,
      jobId,
    ) as ReturnType<TmxDesktopApi["applyAiAudit"]>,
    getAiAuditDefaults: () => ipcRenderer.invoke(
      IPC_CHANNELS.requests.getAiAuditDefaults,
    ) as ReturnType<TmxDesktopApi["getAiAuditDefaults"]>,
    saveAiAuditDefaults: (defaults) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.saveAiAuditDefaults,
      defaults,
    ) as ReturnType<TmxDesktopApi["saveAiAuditDefaults"]>,
    listAiAgentRevisions: (sessionId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.listAiAgentRevisions,
      sessionId,
    ) as ReturnType<TmxDesktopApi["listAiAgentRevisions"]>,
    updateAiAgentRevision: (revisionId, suggestedTargetText) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.updateAiAgentRevision,
      revisionId,
      suggestedTargetText,
    ) as ReturnType<TmxDesktopApi["updateAiAgentRevision"]>,
    applyAiAgentRevisions: (sessionId, revisionIds) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.applyAiAgentRevisions,
      sessionId,
      revisionIds,
    ) as ReturnType<TmxDesktopApi["applyAiAgentRevisions"]>,
    ignoreAiAgentRevision: (revisionId) => ipcRenderer.invoke(
      IPC_CHANNELS.requests.ignoreAiAgentRevision,
      revisionId,
    ) as ReturnType<TmxDesktopApi["ignoreAiAgentRevision"]>,
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
    onAiAgentEvent: (listener: (event: AiAgentEvent) => void) => (
      subscribe(IPC_CHANNELS.events.aiAgentEvent, listener)
    ),
    onAiAuditEvent: (listener: (event: AiAuditEvent) => void) => (
      subscribe(IPC_CHANNELS.events.aiAuditEvent, listener)
    ),
  };
}
