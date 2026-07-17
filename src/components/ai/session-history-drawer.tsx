"use client";

import {
  History,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AiSessionRecord } from "@/lib/desktop-types";

type SessionHistoryDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: AiSessionRecord[];
  activeSessionId: string | null;
  loading: boolean;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onRename: (sessionId: string, title: string) => boolean | Promise<boolean>;
  onDelete: (sessionId: string) => boolean | Promise<boolean>;
};

/** AI 助手的历史会话抽屉：点击“历史”按钮后从右侧滑出，选择或新建会话。 */
export function SessionHistoryDrawer({
  open,
  onOpenChange,
  sessions,
  activeSessionId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: SessionHistoryDrawerProps) {
  const [renameSession, setRenameSession] = useState<AiSessionRecord | null>(null);
  const [deleteSession, setDeleteSession] = useState<AiSessionRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);

  const submitRename = async () => {
    if (!renameSession || !renameValue.trim()) return;
    setOperationBusy(true);
    try {
      if (await onRename(renameSession.id, renameValue.trim())) {
        setRenameSession(null);
      }
    } finally {
      setOperationBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteSession) return;
    setOperationBusy(true);
    try {
      if (await onDelete(deleteSession.id)) {
        setDeleteSession(null);
      }
    } finally {
      setOperationBusy(false);
    }
  };

  return (
    <>
      <Drawer direction="right" onOpenChange={onOpenChange} open={open}>
        <DrawerContent className="w-[min(360px,80vw)] gap-0 bg-background sm:max-w-[360px]">
          <DrawerHeader className="flex h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-border bg-card px-4 py-0 text-left">
            <div className="min-w-0">
              <DrawerTitle className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <History size={16} />
                历史会话
              </DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground">
                选择历史会话或新建对话
              </DrawerDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                aria-label="新建会话"
                onClick={onCreate}
                size="icon-sm"
                title="新建会话"
                type="button"
                variant="ghost"
              >
                <MessageSquarePlus />
              </Button>
              <DrawerClose asChild>
                <Button
                  aria-label="关闭历史会话"
                  className="text-muted-foreground"
                  size="icon"
                  title="关闭历史会话"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {sessions.length === 0 && !loading ? (
              <p className="px-2 py-3 text-xs leading-5 text-muted-foreground/70">
                发送消息后自动创建会话
              </p>
            ) : null}
            {sessions.map((session) => (
              <div
                className={cn(
                  "group flex items-center rounded-lg",
                  session.id === activeSessionId &&
                    "bg-accent text-accent-foreground",
                )}
                key={session.id}
              >
                <Button
                  className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-2 py-2 text-left text-xs leading-4 hover:bg-transparent"
                  onClick={() => onSelect(session.id)}
                  title={session.title}
                  type="button"
                  variant="ghost"
                >
                  <span className="line-clamp-2">{session.title}</span>
                </Button>
                <DropdownMenu
                  modal={false}
                  onOpenChange={(nextOpen) => {
                    setMenuSessionId(nextOpen ? session.id : null);
                  }}
                  open={menuSessionId === session.id}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`更多：${session.title}`}
                      className="mr-1 shrink-0"
                      onClick={() => setMenuSessionId(session.id)}
                      size="icon-sm"
                      title="会话操作"
                      type="button"
                      variant="ghost"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenameSession(session);
                        setRenameValue(session.title);
                      }}
                    >
                      <Pencil />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDeleteSession(session)}
                      variant="destructive"
                    >
                      <Trash2 />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !operationBusy) setRenameSession(null);
        }}
        open={Boolean(renameSession)}
      >
        <DialogContent showCloseButton={!operationBusy}>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>修改后会同步显示在工具栏和历史会话中。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ai-session-name">会话名称</Label>
            <Input
              aria-label="会话名称"
              autoFocus
              disabled={operationBusy}
              id="ai-session-name"
              maxLength={100}
              onChange={(event) => setRenameValue(event.target.value)}
              value={renameValue}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={operationBusy}
              onClick={() => setRenameSession(null)}
              type="button"
              variant="ghost"
            >
              取消
            </Button>
            <Button
              disabled={operationBusy || !renameValue.trim()}
              onClick={() => void submitRename()}
              type="button"
            >
              {operationBusy ? <Loader2 className="animate-spin" /> : null}
              保存名称
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !operationBusy) setDeleteSession(null);
        }}
        open={Boolean(deleteSession)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除“{deleteSession?.title}”
            </AlertDialogTitle>
            <AlertDialogDescription>
              会话中的消息和未应用修改建议也会被删除，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={operationBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={operationBusy}
              onClick={() => void confirmDelete()}
              variant="destructive"
            >
              {operationBusy ? <Loader2 className="animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
