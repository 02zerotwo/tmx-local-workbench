"use client";

import {
  Bot,
  KeyRound,
  ListChecks,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentConversation } from "./agent-conversation";
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
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 操作失败，请重试";
}

export function AiModePanel({ api, projectId, targetLanguages, onApplied }: AiModePanelProps) {
  const [settings, setSettings] = useState<DeepSeekSettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("conversation");

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

  const saveKey = async () => {
    setBusy(true);
    setError("");
    try {
      setSettings(await api.saveDeepSeekKey(apiKey));
      setApiKey("");
    } catch (saveError) {
      setError(errorMessage(saveError));
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
      setDeleteConfirming(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" size={16} />
        正在检查 AI 配置
      </div>
    );
  }

  if (!settings?.configured) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound size={16} />
            配置 DeepSeek API Key
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Key 使用系统加密服务保存在本机，不写入项目数据库或导出文件。
          </p>
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
      <div className="flex min-h-12 items-center gap-2 border-b border-border bg-card px-3">
        <Bot size={16} />
        <span className="text-sm font-semibold text-foreground">DeepSeek Agent</span>
        <Badge className="ml-auto" variant="secondary">
          {settings.maskedKey}
        </Badge>
        <Button
          aria-label="验证 AI 连接"
          disabled={busy}
          onClick={() => void verify()}
          size="icon-sm"
          title="验证连接"
          variant="ghost"
        >
          <RefreshCw className={busy ? "animate-spin" : ""} />
        </Button>
        <Button
          aria-label="删除 API Key"
          disabled={busy}
          onClick={() => setDeleteConfirming(true)}
          size="icon-sm"
          title="删除 API Key"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      {error ? <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</div> : null}
      <Tabs className="flex min-h-0 flex-1 flex-col" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="m-2 grid w-auto grid-cols-2 rounded-md" variant="default">
          <TabsTrigger value="conversation"><MessageSquare />会话</TabsTrigger>
          <TabsTrigger value="audit"><ListChecks />审查</TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0 flex-1 p-2 pt-0" value="conversation">
          <AgentConversation api={api} onApplied={onApplied} projectId={projectId} />
        </TabsContent>
        <TabsContent className="min-h-0 flex-1 p-2 pt-0" value="audit">
          <AuditPanel
            api={api}
            onApplied={onApplied}
            projectId={projectId}
            targetLanguages={targetLanguages}
          />
        </TabsContent>
      </Tabs>
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
