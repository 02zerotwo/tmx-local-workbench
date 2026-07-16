import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  stepCountIs,
  tool,
  ToolLoopAgent,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import type { AiMessagePart } from "../../src/lib/desktop-types";
import type { AiMessage } from "../database/ai-agent-repository";
import type { AgentRevisionRepository } from "../database/ai-agent-revision-repository";
import type { ProjectRepository } from "../database/project-repository";
import type { UnitRepository } from "../database/unit-repository";
import { translationContentHash } from "./audit-workflow";
import type { DeepSeekSettingsService } from "./settings-service";
import type { GenerateReply } from "./translation-agent-service";

type ToolPart = Extract<AiMessagePart, { type: "tool" }>;

const REVISION_CATEGORIES = [
  "accuracy",
  "fluency",
  "terminology",
  "consistency",
  "punctuation",
  "formatting",
] as const;

export function buildModelMessages(messages: AiMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];
  for (const message of messages) {
    if (
      message.status !== "complete"
      || (message.role !== "user" && message.role !== "assistant")
    ) {
      continue;
    }
    const content = message.parts
      .filter((part): part is { type: "text"; text: string } => (
        Boolean(part && typeof part === "object" && "type" in part && "text" in part
          && part.type === "text" && typeof part.text === "string")
      ))
      .map(({ text }) => text)
      .join("\n");
    if (content) {
      result.push({ role: message.role, content });
    }
  }
  return result;
}

export function createAgentReplyGenerator(options: {
  settings: DeepSeekSettingsService;
  projectRepository: ProjectRepository;
  unitRepository: UnitRepository;
  revisionRepository: AgentRevisionRepository;
}): GenerateReply {
  return async ({ session, messages, onEvent, abortSignal }) => {
    const apiKey = await options.settings.getApiKeyForMainProcess();
    const project = options.projectRepository.getProject(session.projectId);
    if (!project) {
      throw new Error("项目不存在或已删除");
    }
    const provider = createDeepSeek({ apiKey });
    const revisionIds: string[] = [];

    const tools = {
      getProjectSummary: tool({
        description: "读取当前 TMX 项目的语言、条目和修改统计。",
        inputSchema: z.object({}),
        execute: async () => ({
          id: project.id,
          name: project.name,
          sourceLanguage: project.sourceLanguage,
          targetLanguages: project.targetLanguages,
          totalUnits: project.totalUnits,
          changedUnits: project.changedUnits,
          emptyUnits: project.emptyUnits,
        }),
      }),
      searchTranslationUnits: tool({
        description:
          "在当前项目中搜索原文与译文，只用于读取和分析。返回 rowId 供后续 proposeRevision 引用。",
        inputSchema: z.object({
          query: z.string().max(200),
          targetLanguage: z.string().max(50).optional(),
          status: z.enum(["all", "empty", "changed"]).default("all"),
        }),
        execute: async ({ query, targetLanguage, status }) => {
          const result = options.unitRepository.queryProject({
            projectId: project.id,
            filters: {
              query,
              targetLanguage: targetLanguage ?? "",
              status,
              duplicateOnly: false,
            },
            page: 1,
            pageSize: 100,
          });
          return {
            total: result.total,
            rows: result.rows.slice(0, 20).map((row) => ({
              rowId: row.rowId,
              sourceLang: row.sourceLang,
              sourceText: row.sourceText,
              targetLang: row.targetLang,
              targetText: row.targetText,
              changed: row.changed,
            })),
          };
        },
      }),
      proposeRevision: tool({
        description:
          "为某条翻译暂存一条修改建议（不会立即写库，需用户审阅后确认）。仅在确有问题且能给出可直接替换的完整译文时调用。",
        inputSchema: z.object({
          rowId: z.string().min(1),
          suggestedTargetText: z.string().min(1).max(10_000),
          category: z.enum(REVISION_CATEGORIES).default("accuracy"),
          reason: z.string().max(500).default(""),
          confidence: z.number().min(0).max(1).default(0.6),
        }),
        execute: async (
          { rowId, suggestedTargetText, category, reason, confidence },
          { toolCallId },
        ) => {
          const current = options.unitRepository.getUnitRow(project.id, rowId);
          if (!current) {
            return { staged: false as const, reason: `未找到翻译行 ${rowId}` };
          }
          if (suggestedTargetText.trim() === current.targetText.trim()) {
            return {
              staged: false as const,
              reason: "建议译文与现有译文一致，无需修改",
            };
          }
          const revision = options.revisionRepository.createRevision({
            sessionId: session.id,
            toolCallId,
            projectId: project.id,
            rowId,
            sourceLang: current.sourceLang,
            sourceText: current.sourceText,
            targetLang: current.targetLang,
            originalTargetText: current.targetText,
            suggestedTargetText,
            category,
            reason,
            confidence,
            contentHash: translationContentHash({
              sourceLang: current.sourceLang,
              sourceText: current.sourceText,
              targetLang: current.targetLang,
              targetText: current.targetText,
            }),
          });
          revisionIds.push(revision.id);
          onEvent({ type: "revision", revision });
          return {
            staged: true as const,
            revisionId: revision.id,
            rowId,
            suggestedTargetText,
          };
        },
      }),
    };

    const agent = new ToolLoopAgent({
      model: provider(session.model),
      instructions: [
        "你是 TMX 翻译项目的专业审校 Agent，可自主完成“搜索 → 审查 → 判断 → 给出修改建议”。",
        "工作流程：用 searchTranslationUnits 检索候选译文；逐条判断是否存在准确性/流畅性/术语/一致性/标点/格式问题；",
        "对确有问题、且能给出可直接替换的完整译文的条目，调用 proposeRevision 暂存一条修改建议；最后用文字总结你发现的问题与建议。",
        "重要规则：proposeRevision 只是“暂存建议”，绝不会立即写库；真正的修改由用户在界面审阅后确认应用。",
        "回复面向不懂技术的普通用户：用自然语言，不要出现 rowId、内部编号、哈希、JSON 等技术标识；需要指代某条翻译时，用它的原文或译文内容来描述。",
        "保留占位符、变量、数字、标签、快捷键和代码片段，不得擅自增删；没有把握时不要提建议，也不要为了改写而改写。",
        `当前项目：${project.name}，${project.sourceLanguage} → ${project.targetLanguages.join(", ")}`,
      ].join("\n"),
      tools,
      stopWhen: stepCountIs(16),
      maxOutputTokens: 4_096,
      providerOptions: {
        deepseek: {
          thinking: { type: "enabled" },
        },
      },
    });

    onEvent({ type: "status", status: "thinking" });
    const stream = await agent.stream({
      messages: buildModelMessages(messages),
      abortSignal,
    });

    const parts: AiMessagePart[] = [];
    const toolPartsById = new Map<string, ToolPart>();
    let currentText: { type: "text"; text: string } | null = null;
    let currentReasoning: { type: "reasoning"; text: string } | null = null;

    const appendText = (delta: string) => {
      currentReasoning = null;
      if (!currentText) {
        currentText = { type: "text", text: "" };
        parts.push(currentText);
      }
      currentText.text += delta;
    };
    const appendReasoning = (delta: string) => {
      currentText = null;
      if (!currentReasoning) {
        currentReasoning = { type: "reasoning", text: "" };
        parts.push(currentReasoning);
      }
      currentReasoning.text += delta;
    };
    const breakInline = () => {
      currentText = null;
      currentReasoning = null;
    };

    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") {
        appendText(part.text);
        onEvent({ type: "text-delta", delta: part.text });
      } else if (part.type === "reasoning-delta") {
        appendReasoning(part.text);
        onEvent({ type: "reasoning-delta", delta: part.text });
      } else if (part.type === "tool-call") {
        breakInline();
        const toolPart: ToolPart = {
          type: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          state: "input-available",
          input: part.input,
        };
        parts.push(toolPart);
        toolPartsById.set(part.toolCallId, toolPart);
        onEvent({
          type: "tool",
          toolCallId: part.toolCallId,
          name: part.toolName,
          status: "running",
          input: part.input,
        });
      } else if (part.type === "tool-result") {
        const toolPart = toolPartsById.get(part.toolCallId);
        if (toolPart) {
          toolPart.state = "output-available";
          toolPart.output = part.output;
        }
        onEvent({
          type: "tool",
          toolCallId: part.toolCallId,
          name: part.toolName,
          status: "complete",
          output: part.output,
        });
      } else if (part.type === "tool-error") {
        const toolPart = toolPartsById.get(part.toolCallId);
        const errorText =
          part.error instanceof Error ? part.error.message : String(part.error);
        if (toolPart) {
          toolPart.state = "output-error";
          toolPart.errorText = errorText;
        }
        onEvent({
          type: "tool",
          toolCallId: part.toolCallId,
          name: part.toolName,
          status: "error",
        });
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    return { parts, revisionIds };
  };
}
