import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText } from "ai";

export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";

export async function checkDeepSeekConnection(
  apiKey: string,
  modelId: DeepSeekModelId,
): Promise<void> {
  const provider = createDeepSeek({ apiKey });
  await generateText({
    model: provider(modelId),
    prompt: "Reply with OK.",
    maxOutputTokens: 8,
    maxRetries: 1,
    timeout: 20_000,
    providerOptions: {
      deepseek: {
        thinking: { type: "disabled" },
      },
    },
  });
}

