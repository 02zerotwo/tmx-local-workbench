import type { TmxDesktopApi } from "../../src/lib/desktop-types";

type EventMethodName =
  | "onImportProgress"
  | "onExportProgress"
  | "onAiAgentEvent"
  | "onAiAuditEvent"
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
    getAiSettings: "tmx-workbench:ai:settings:get",
    saveDeepSeekKey: "tmx-workbench:ai:settings:save-key",
    verifyDeepSeekConnection: "tmx-workbench:ai:settings:verify",
    deleteDeepSeekKey: "tmx-workbench:ai:settings:delete-key",
    listAiSessions: "tmx-workbench:ai:sessions:list",
    createAiSession: "tmx-workbench:ai:sessions:create",
    listAiMessages: "tmx-workbench:ai:messages:list",
    sendAiMessage: "tmx-workbench:ai:messages:send",
    stopAiMessage: "tmx-workbench:ai:messages:stop",
    retryAiMessage: "tmx-workbench:ai:messages:retry",
    listAiAuditJobs: "tmx-workbench:ai:audits:list",
    startAiAudit: "tmx-workbench:ai:audits:start",
    pauseAiAudit: "tmx-workbench:ai:audits:pause",
    resumeAiAudit: "tmx-workbench:ai:audits:resume",
    listAiAuditFindings: "tmx-workbench:ai:audits:findings:list",
    decideAiAuditFinding: "tmx-workbench:ai:audits:findings:decide",
    acceptAllAiAuditFindings: "tmx-workbench:ai:audits:findings:accept-all",
    applyAiAudit: "tmx-workbench:ai:audits:apply",
    confirmAppClose: "tmx-workbench:application:confirm-close",
  } satisfies Record<RequestMethodName, string>,
  events: {
    importProgress: "tmx-workbench:progress:import",
    exportProgress: "tmx-workbench:progress:export",
    aiAgentEvent: "tmx-workbench:ai:agent:event",
    aiAuditEvent: "tmx-workbench:ai:audit:event",
    appCloseRequested: "tmx-workbench:application:close-requested",
  },
} as const;
