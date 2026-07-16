"use client";

import { Sparkles, SquarePen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkspaceMode = "edit" | "ai";

type WorkspaceDetailPanelProps = {
  /** 编辑面板内容（翻译编辑器或空状态）。始终保持挂载以保留未保存的草稿与保存回调。 */
  editor: ReactNode;
  /** AI 助手面板内容。首次切换到 AI 模式后才会挂载，之后保持挂载以保留会话状态。 */
  aiPanel: ReactNode;
};

/**
 * 右侧详情面板：在同一侧边栏内通过顶部页签在“编辑面板”与“AI 助手”之间切换，
 * 取代原先点击按钮弹出抽屉的交互。
 */
export function WorkspaceDetailPanel({
  editor,
  aiPanel,
}: WorkspaceDetailPanelProps) {
  const [mode, setMode] = useState<WorkspaceMode>("edit");
  const [aiMounted, setAiMounted] = useState(false);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-slate-50"
      data-testid="workspace-detail-panel"
    >
      <Tabs
        className="flex h-full min-h-0 flex-col gap-0"
        onValueChange={(value) => {
          const nextMode = value as WorkspaceMode;
          setMode(nextMode);
          if (nextMode === "ai") {
            setAiMounted(true);
          }
        }}
        value={mode}
      >
        <div className="flex h-11 shrink-0 items-center border-b border-slate-200 bg-white px-3">
          <TabsList aria-label="工作模式" className="h-8">
            <TabsTrigger value="edit">
              <SquarePen />
              编辑
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles />
              AI 模式
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          className="min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden"
          forceMount
          value="edit"
        >
          {editor}
        </TabsContent>

        {aiMounted ? (
          <TabsContent
            className="min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden"
            forceMount
            value="ai"
          >
            {aiPanel}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
