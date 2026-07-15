import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";
import type { DeepSeekSettingsService } from "./settings-service";
import type { AnalyzeAuditItem } from "./audit-workflow";

const auditOutputSchema = z.object({
  findings: z.array(z.object({
    category: z.enum([
      "accuracy",
      "fluency",
      "terminology",
      "consistency",
      "punctuation",
      "formatting",
    ]),
    severity: z.enum(["info", "warning", "error"]),
    summary: z.string().max(200),
    evidence: z.string().max(500),
    suggestedTargetText: z.string().max(10_000).nullable(),
    confidence: z.number().min(0).max(1),
  })).max(8),
});

export function createAuditAnalyzer(
  settings: DeepSeekSettingsService,
): AnalyzeAuditItem {
  return async (input) => {
    const apiKey = await settings.getApiKeyForMainProcess();
    const provider = createDeepSeek({ apiKey });
    const result = await generateObject({
      model: provider(input.model),
      schema: auditOutputSchema,
      system: [
        "你是专业翻译审校员。只报告明确、可解释的问题，不要为了改写而改写。",
        "保留占位符、变量、数字、标签、快捷键和代码片段，不得擅自增删。",
        "suggestedTargetText 必须是可直接替换的完整目标文本；不需要改写时为 null。",
      ].join("\n"),
      prompt: JSON.stringify({
        task: "审查一条 TMX 翻译",
        enabledCategories: input.boundaries.categories,
        allowRewrite: input.boundaries.allowRewrite,
        source: { language: input.sourceLang, text: input.sourceText },
        target: { language: input.targetLang, text: input.targetText },
      }),
      providerOptions: {
        deepseek: { thinking: { type: "enabled" } },
      },
    });
    return result.object.findings;
  };
}
