"use client";

import {
  History,
  KeyRound,
  ListChecks,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type AiCompactToolbarProps = {
  activeTab: "conversation" | "audit";
  sessionTitle?: string;
  onCreateSession?: () => void;
  onOpenHistory?: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
};

export function AiCompactToolbar({
  activeTab,
  sessionTitle,
  onCreateSession,
  onOpenHistory,
  onOpenEditor,
  onOpenSettings,
}: AiCompactToolbarProps) {
  const conversation = activeTab === "conversation";

  return (
    <div
      aria-label="AI 工具栏"
      className="ai-compact-toolbar flex h-10 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2"
      role="toolbar"
    >
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

      <TabsList className="h-7 shrink-0 gap-0.5 rounded-md p-0.5">
        <TabsTrigger className="h-6 gap-1 px-2 text-xs" value="conversation">
          <MessageSquare />
          会话
        </TabsTrigger>
        <TabsTrigger className="h-6 gap-1 px-2 text-xs" value="audit">
          <ListChecks />
          审查
        </TabsTrigger>
      </TabsList>

      <div className="ml-auto flex min-w-0 items-center gap-0.5">
        {conversation && sessionTitle ? (
          <span
            className="ai-toolbar-session-title max-w-36 truncate px-1.5 text-xs text-muted-foreground"
            title={sessionTitle}
          >
            {sessionTitle}
          </span>
        ) : null}

        {conversation && onOpenHistory ? (
          <Button
            aria-label="历史会话"
            className="ai-toolbar-history"
            onClick={onOpenHistory}
            size="icon-sm"
            title="历史会话"
            type="button"
            variant="ghost"
          >
            <History />
          </Button>
        ) : null}

        {conversation && onCreateSession ? (
          <Button
            aria-label="新建会话"
            onClick={onCreateSession}
            size="icon-sm"
            title="新建会话"
            type="button"
            variant="ghost"
          >
            <MessageSquarePlus />
          </Button>
        ) : null}

        <Button
          aria-label="Key 设置"
          className="ai-toolbar-settings"
          onClick={onOpenSettings}
          size="icon-sm"
          title="Key 设置"
          type="button"
          variant="ghost"
        >
          <KeyRound />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="更多工具"
              className="ai-toolbar-more-settings"
              size="icon-sm"
              title="更多工具"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onOpenSettings}>
                <KeyRound />
                Key 设置
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="更多工具"
              className="ai-toolbar-more-compact"
              size="icon-sm"
              title="更多工具"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {conversation && onOpenHistory ? (
                <DropdownMenuItem onSelect={onOpenHistory}>
                  <History />
                  历史会话
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onOpenSettings}>
                <KeyRound />
                Key 设置
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
