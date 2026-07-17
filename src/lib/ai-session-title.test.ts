import { describe, expect, it } from "vitest";
import { createAiSessionTitle } from "./ai-session-title";

describe("createAiSessionTitle", () => {
  it("trims and collapses whitespace from the first user message", () => {
    expect(createAiSessionTitle("  帮我\n\n检查   这份翻译  ")).toBe(
      "帮我 检查 这份翻译",
    );
  });

  it("keeps a normalized title at the 30-character limit unchanged", () => {
    const content = "一".repeat(30);

    expect(createAiSessionTitle(content)).toBe(content);
  });

  it("truncates a long title by Unicode characters and appends an ellipsis", () => {
    expect(createAiSessionTitle(`${"😀".repeat(30)}额外内容`)).toBe(
      `${"😀".repeat(30)}…`,
    );
  });
});
