import { describe, expect, it } from "vitest";
import { diffTokens, tokenizeForDiff } from "./text-diff";

function joined(
  segments: ReturnType<typeof diffTokens>,
  type: "equal" | "insert" | "delete",
): string {
  return segments
    .filter((segment) => segment.type === type)
    .map((segment) => segment.text)
    .join("");
}

describe("tokenizeForDiff", () => {
  it("splits CJK by character and latin by word", () => {
    expect(tokenizeForDiff("重启 server")).toEqual(["重", "启", " ", "server"]);
  });
});

describe("diffTokens", () => {
  it("returns one equal segment for identical text", () => {
    expect(diffTokens("hello", "hello")).toEqual([
      { type: "equal", text: "hello" },
    ]);
  });

  it("highlights a word-level insertion in English", () => {
    const segments = diffTokens("Reset alarm", "Reset the alarm");
    expect(joined(segments, "delete")).toBe("");
    expect(joined(segments, "insert")).toContain("the");
    expect(joined(segments, "equal")).toContain("Reset");
    expect(joined(segments, "equal")).toContain("alarm");
  });

  it("highlights a character-level insertion in Chinese", () => {
    const segments = diffTokens("报警复位", "报警复位步骤");
    expect(segments.some((s) => s.type === "insert" && s.text === "步骤")).toBe(true);
    expect(segments.filter((s) => s.type === "delete")).toHaveLength(0);
  });

  it("marks both deletion and insertion for a replacement", () => {
    const segments = diffTokens("猫", "狗");
    expect(joined(segments, "delete")).toBe("猫");
    expect(joined(segments, "insert")).toBe("狗");
  });
});
