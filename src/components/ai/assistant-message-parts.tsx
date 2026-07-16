"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { MarkdownResponse } from "@/components/ai/markdown-response";
import type { AiMessagePart } from "@/lib/desktop-types";

const TOOL_LABEL: Record<string, string> = {
  searchTranslationUnits: "搜索译文",
  getProjectSummary: "读取项目概况",
  proposeRevision: "生成修改建议",
};

type AssistantMessagePartsProps = {
  parts: AiMessagePart[];
  /** true 时表示这是正在流式产生的消息，推理块保持展开动画。 */
  streaming?: boolean;
};

function toolRowId(input: unknown): string | null {
  if (
    input
    && typeof input === "object"
    && "rowId" in input
    && typeof (input as { rowId?: unknown }).rowId === "string"
  ) {
    return (input as { rowId: string }).rowId;
  }
  return null;
}

/**
 * 按数组顺序渲染助手消息的片段：文本 / 推理 / 工具调用。
 * 实时流与历史消息共用此组件，保证工具调用与文字严格按执行顺序呈现。
 */
export function AssistantMessageParts({
  parts,
  streaming = false,
}: AssistantMessagePartsProps) {
  return (
    <>
      {parts.map((part, index) => {
        const key = `${index}-${part.type}`;
        if (part.type === "text") {
          return part.text.trim() ? (
            <MarkdownResponse content={part.text} key={key} streaming={streaming} />
          ) : null;
        }
        if (part.type === "reasoning") {
          return part.text.trim() ? (
            <Reasoning defaultOpen isStreaming={streaming} key={key}>
              <ReasoningTrigger getThinkingMessage={() => "推理过程"} />
              <ReasoningContent>{part.text}</ReasoningContent>
            </Reasoning>
          ) : null;
        }

        const rowId = toolRowId(part.input);
        const label = TOOL_LABEL[part.toolName] ?? part.toolName;
        return (
          <Tool key={key}>
            <ToolHeader
              state={part.state}
              title={rowId ? `${label} · ${rowId}` : label}
              toolName={part.toolName}
              type="dynamic-tool"
            />
          </Tool>
        );
      })}
    </>
  );
}
