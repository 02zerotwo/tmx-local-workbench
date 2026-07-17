"use client";

import { KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AiKeySettingsDialogProps = {
  busy: boolean;
  error: string;
  maskedKey: string;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  onReplace: (key: string) => boolean | Promise<boolean>;
  onVerify: () => void;
  open: boolean;
  verifiedAt: string | null;
};

function verificationLabel(verifiedAt: string | null): string {
  if (!verifiedAt) {
    return "尚未验证连接";
  }

  return `已验证 · ${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(verifiedAt))}`;
}

export function AiKeySettingsDialog({
  busy,
  error,
  maskedKey,
  onDelete,
  onOpenChange,
  onReplace,
  onVerify,
  open,
  verifiedAt,
}: AiKeySettingsDialogProps) {
  const [replacementKey, setReplacementKey] = useState("");

  const replaceKey = async () => {
    const replaced = await onReplace(replacementKey.trim());
    if (replaced) {
      setReplacementKey("");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} />
            DeepSeek API Key 设置
          </DialogTitle>
          <DialogDescription>
            Key 使用系统加密服务保存在本机，不写入项目数据库或导出文件。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">当前 Key</p>
              <p className="mt-1 truncate font-mono text-sm font-medium">{maskedKey}</p>
            </div>
            <Button
              disabled={busy}
              onClick={onVerify}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className={busy ? "animate-spin" : ""} />
              验证连接
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {verificationLabel(verifiedAt)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deepseek-replacement-key">替换 API Key</Label>
          <Input
            aria-label="替换 DeepSeek API Key"
            autoComplete="off"
            id="deepseek-replacement-key"
            onChange={(event) => setReplacementKey(event.target.value)}
            placeholder="输入新的 sk-..."
            type="password"
            value={replacementKey}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            新 Key 验证成功后会立即替换当前 Key。
          </p>
        </div>

        {error ? (
          <p className="text-xs leading-5 text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button
            disabled={busy}
            onClick={onDelete}
            type="button"
            variant="destructive"
          >
            <Trash2 />
            删除 API Key
          </Button>
          <Button
            disabled={busy || !replacementKey.trim()}
            onClick={() => void replaceKey()}
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            替换并验证
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
