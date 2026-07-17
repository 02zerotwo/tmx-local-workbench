"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type WorkspaceMode = "edit" | "ai";

type WorkspaceModeControls = {
  openEditor: () => void;
  openAi: () => void;
};

type WorkspaceDetailPanelProps = {
  /** 编辑面板内容（翻译编辑器或空状态）。始终保持挂载以保留未保存的草稿与保存回调。 */
  editor: (controls: WorkspaceModeControls) => ReactNode;
  /** AI 助手面板内容。首次切换到 AI 模式后才会挂载，之后保持挂载以保留会话状态。 */
  aiPanel: (controls: WorkspaceModeControls) => ReactNode;
};

/**
 * 右侧详情面板统一管理“编辑面板”与“AI 助手”的挂载和可见状态。
 * 模式入口由各面板放进自己的工具栏，避免额外占用一整行高度。
 */
export function WorkspaceDetailPanel({
  editor,
  aiPanel,
}: WorkspaceDetailPanelProps) {
  const [mode, setMode] = useState<WorkspaceMode>("edit");
  const [aiMounted, setAiMounted] = useState(false);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const focusAfterSwitchRef = useRef(false);
  const controls: WorkspaceModeControls = {
    openEditor: () => {
      focusAfterSwitchRef.current = true;
      setMode("edit");
    },
    openAi: () => {
      focusAfterSwitchRef.current = true;
      setAiMounted(true);
      setMode("ai");
    },
  };

  useEffect(() => {
    if (!focusAfterSwitchRef.current) {
      return;
    }
    focusAfterSwitchRef.current = false;
    const activePanel =
      mode === "edit" ? editorPanelRef.current : aiPanelRef.current;
    activePanel?.focus({ preventScroll: true });
  }, [mode]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="workspace-detail-panel"
    >
      <div
        aria-label="编辑模式"
        aria-hidden={mode !== "edit"}
        className={
          mode === "edit"
            ? "flex h-full w-full min-h-0 flex-col"
            : "hidden"
        }
        ref={editorPanelRef}
        role="region"
        tabIndex={-1}
      >
        {editor(controls)}
      </div>

      {aiMounted ? (
        <div
          aria-label="AI 模式"
          aria-hidden={mode !== "ai"}
          className={
            mode === "ai"
              ? "flex h-full w-full min-h-0 flex-col"
              : "hidden"
          }
          ref={aiPanelRef}
          role="region"
          tabIndex={-1}
        >
          {aiPanel(controls)}
        </div>
      ) : null}
    </div>
  );
}
