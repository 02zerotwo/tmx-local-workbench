"use client";

import { History, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
}: SessionHistoryDrawerProps) {
  return (
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
            <Button
              className={cn(
                "h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs leading-4",
                session.id === activeSessionId &&
                  "bg-accent text-accent-foreground",
              )}
              key={session.id}
              onClick={() => onSelect(session.id)}
              title={session.title}
              type="button"
              variant="ghost"
            >
              <span className="line-clamp-2">{session.title}</span>
            </Button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
