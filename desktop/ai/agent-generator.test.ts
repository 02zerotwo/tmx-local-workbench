// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AiMessage } from "../database/ai-agent-repository";
import { buildModelMessages } from "./agent-generator";

describe("buildModelMessages", () => {
  it("restores complete conversation text and skips interrupted assistant output", () => {
    const base = {
      sessionId: "session-1",
      parentMessageId: null,
      branchId: "main",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    const messages: AiMessage[] = [
      { ...base, id: "1", role: "user", status: "complete", parts: [{ type: "text", text: "你好" }] },
      { ...base, id: "2", role: "assistant", status: "complete", parts: [{ type: "text", text: "你好" }] },
      { ...base, id: "3", role: "assistant", status: "interrupted", parts: [{ type: "text", text: "中断" }] },
    ];

    expect(buildModelMessages(messages)).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好" },
    ]);
  });
});
