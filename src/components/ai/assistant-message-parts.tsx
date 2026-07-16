"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { MarkdownResponse } from "@/components/ai/markdown-response";
import { RevisionProposalCard } from "@/components/ai/revision-proposal-card";
import type { AiAgentRevisionRecord, AiMessagePart } from "@/lib/desktop-types";

const TOOL_LABEL: Record<string, string> = {
  searchTranslationUnits: "搜索译文",
  getProjectSummary: "读取项目概况",
  proposeRevision: "生成修改建议",
};

type AssistantMessagePartsProps = {
  parts: AiMessagePart[];
  revisionsById: Map<string, AiAgentRevisionRecord>;
  busyRevisionId: string | null;
  streaming?: boolean;
  onApplyRevision: (revisionId: string) => void;
  onIgnoreRevision: (revisionId: string) => void;
};

function revisionIdFromOutput(output: unknown): string | null {
  if (
    output
    && typeof output === "object"
    && "staged" in output
    && (output as { staged?: unknown }).staged === true
    && "revisionId" in output
    && typeof (output as { revisionId?: unknown }).revisionId === "string"
  ) {
    return (output as { revisionId: string }).revisionId;
  }
  return null;
}

/** 按顺序渲染助手消息的片段：文本 / 推理 / 工具调用 / 修改建议卡片。 */
export function AssistantMessageParts({
  parts,
  revisionsById,
  busyRevisionId,
  streaming = false,
  onApplyRevision,
  onIgnoreRevision,
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
            <Reasoning key={key}>
              <ReasoningTrigger getThinkingMessage={() => "推理过程"} />
              <ReasoningContent>{part.text}</ReasoningContent>
            </Reasoning>
          ) : null;
        }

        if (part.toolName === "proposeRevision") {
          const revisionId = revisionIdFromOutput(part.output);
          const revision = revisionId ? revisionsById.get(revisionId) : undefined;
          if (revision) {
            return (
              <RevisionProposalCard
                busy={busyRevisionId === revision.id}
                key={key}
                onApply={onApplyRevision}
                onIgnore={onIgnoreRevision}
                revision={revision}
              />
            );
          }
        }

        return (
          <Tool key={key}>
            <ToolHeader
              state={part.state}
              title={TOOL_LABEL[part.toolName] ?? part.toolName}
              toolName={part.toolName}
              type="dynamic-tool"
            />
          </Tool>
        );
      })}
    </>
  );
}
