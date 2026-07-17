"use client";

import {
  KeyRound,
  Loader2,
  ShieldCheck,
  SquarePen,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AgentConversation } from "./agent-conversation";
import { AiCompactToolbar } from "./ai-compact-toolbar";
import { AiKeySettingsDialog } from "./ai-key-settings-dialog";
import { AuditPanel } from "./audit-panel";
import type {
  DeepSeekSettingsStatus,
  TmxDesktopApi,
} from "@/lib/desktop-types";

type AiSettingsApi = Pick<
  TmxDesktopApi,
  | "getAiSettings"
  | "saveDeepSeekKey"
  | "verifyDeepSeekConnection"
  | "deleteDeepSeekKey"
  | "queryProject"
  | "listAiSessions"
  | "createAiSession"
  | "renameAiSession"
  | "deleteAiSession"
  | "listAiMessages"
  | "sendAiMessage"
  | "stopAiMessage"
  | "retryAiMessage"
  | "onAiAgentEvent"
  | "listAiAgentRevisions"
  | "updateAiAgentRevision"
  | "applyAiAgentRevisions"
  | "ignoreAiAgentRevision"
  | "listAiAuditJobs"
  | "startAiAudit"
  | "pauseAiAudit"
  | "resumeAiAudit"
  | "listAiAuditFindings"
  | "decideAiAuditFinding"
  | "acceptAllAiAuditFindings"
  | "applyAiAudit"
  | "getAiAuditDefaults"
  | "saveAiAuditDefaults"
  | "onAiAuditEvent"
>;

type AiModePanelProps = {
  api: AiSettingsApi;
  projectId: string;
  targetLanguages: string[];
  onApplied: () => void;
  onOpenEditor: () => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 操作失败，请重试";
}

export function AiModePanel({
  api,
  projectId,
  targetLanguages,
  onApplied,
  onOpenEditor,
}: AiModePanelProps) {
  const [settings, setSettings] = useState<DeepSeekSettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"conversation" | "audit">("conversation");

  useEffect(() => {
    let active = true;
    api.getAiSettings()
      .then((value) => {
        if (active) {
          setSettings(value);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [api]);

  const saveKey = async (nextKey = apiKey): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      setSettings(await api.saveDeepSeekKey(nextKey));
      setApiKey("");
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      setSettings(await api.verifyDeepSeekConnection());
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setBusy(false);
    }
  };

  const deleteKey = async () => {
    setBusy(true);
    setError("");
    try {
      setSettings(await api.deleteDeepSeekKey());
      setSettingsOpen(false);
      setDeleteConfirming(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-2">
          <Button
            aria-label="编辑模式"
            onClick={onOpenEditor}
            size="icon-sm"
            title="编辑模式"
            type="button"
            variant="ghost"
          >
            <SquarePen />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} />
          正在检查 AI 配置
        </div>
      </div>
    );
  }

  if (!settings?.configured) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border bg-card px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound size={16} />
                配置 DeepSeek API Key
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Key 使用系统加密服务保存在本机，不写入项目数据库或导出文件。
              </p>
            </div>
            <Button
              aria-label="编辑模式"
              className="shrink-0"
              onClick={onOpenEditor}
              size="icon-sm"
              title="编辑模式"
              type="button"
              variant="ghost"
            >
              <SquarePen />
            </Button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <label className="block text-xs font-medium text-foreground" htmlFor="deepseek-api-key">
            DeepSeek API Key
          </label>
          <Input
            aria-label="DeepSeek API Key"
            autoComplete="off"
            id="deepseek-api-key"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            type="password"
            value={apiKey}
          />
          <Button
            className="w-full"
            disabled={busy || !apiKey.trim()}
            onClick={() => void saveKey()}
            size="lg"
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            保存并验证
          </Button>
          {error ? <p className="text-xs leading-5 text-destructive" role="alert">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-project-id={projectId}>
      {error && !settingsOpen ? (
        <div
          className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => setActiveTab(value as "conversation" | "audit")}
        value={activeTab}
      >
        <TabsContent className="min-h-0 flex-1 p-2" value="conversation">
          <AgentConversation
            api={api}
            onApplied={onApplied}
            projectId={projectId}
            renderToolbar={({ sessionTitle, onCreateSession, onOpenHistory }) => (
              <AiCompactToolbar
                activeTab="conversation"
                onCreateSession={onCreateSession}
                onOpenHistory={onOpenHistory}
                onOpenEditor={onOpenEditor}
                onOpenSettings={() => setSettingsOpen(true)}
                sessionTitle={sessionTitle}
              />
            )}
          />
        </TabsContent>
        <TabsContent className="min-h-0 flex-1 p-2" value="audit">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card">
            <AiCompactToolbar
              activeTab="audit"
              onOpenEditor={onOpenEditor}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <div className="min-h-0 flex-1">
              <AuditPanel
                api={api}
                onApplied={onApplied}
                projectId={projectId}
                targetLanguages={targetLanguages}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <AiKeySettingsDialog
        busy={busy}
        error={error}
        maskedKey={settings.maskedKey ?? ""}
        onDelete={() => {
          setSettingsOpen(false);
          setDeleteConfirming(true);
        }}
        onOpenChange={setSettingsOpen}
        onReplace={saveKey}
        onVerify={() => void verify()}
        open={settingsOpen}
        verifiedAt={settings.verifiedAt}
      />
      <AlertDialog onOpenChange={setDeleteConfirming} open={deleteConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 DeepSeek API Key</AlertDialogTitle>
            <AlertDialogDescription>
              删除后 AI 会话和审查功能将暂停使用，已有会话与审查记录不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} variant="ghost">取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void deleteKey()}
              variant="destructive"
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
