import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  stepCountIs,
  tool,
  ToolLoopAgent,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import type { AiMessage } from "../database/ai-agent-repository";
import type { ProjectRepository } from "../database/project-repository";
import type { UnitRepository } from "../database/unit-repository";
import type { DeepSeekSettingsService } from "./settings-service";
import type { GenerateReply } from "./translation-agent-service";

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
}): GenerateReply {
  return async ({ session, messages, onEvent, abortSignal }) => {
    const apiKey = await options.settings.getApiKeyForMainProcess();
    const project = options.projectRepository.getProject(session.projectId);
    if (!project) {
      throw new Error("项目不存在或已删除");
    }
    const provider = createDeepSeek({ apiKey });
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
        description: "在当前项目中搜索源文、译文和元数据，只用于读取和分析。",
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
    };
    const agent = new ToolLoopAgent({
      model: provider(session.model),
      instructions: [
        "你是 TMX 翻译项目的专业审校 Agent。",
        "只根据用户问题和工具返回的数据回答，不虚构项目内容。",
        "工具只用于读取；任何修改必须先生成建议并等待用户确认。",
        `当前项目：${project.name}，${project.sourceLanguage} → ${project.targetLanguages.join(", ")}`,
      ].join("\n"),
      tools,
      stopWhen: stepCountIs(12),
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
    let text = "";
    for await (const part of stream.stream) {
      if (part.type === "text-delta") {
        text += part.text;
        onEvent({ type: "text-delta", delta: part.text });
      } else if (part.type === "reasoning-delta") {
        onEvent({ type: "reasoning-delta", delta: part.text });
      } else if (part.type === "tool-call") {
        onEvent({ type: "tool", name: part.toolName, status: "running" });
      } else if (part.type === "tool-result") {
        onEvent({ type: "tool", name: part.toolName, status: "complete" });
      } else if (part.type === "tool-error") {
        onEvent({ type: "tool", name: part.toolName, status: "error" });
      } else if (part.type === "error") {
        throw part.error;
      }
    }
    return text.trim();
  };
}
