import { describe, expect, it } from "vitest";
import {
  cleanTranslationText,
  isInlineCodeTag,
  normalizeDuplicateKey,
  shouldSkipTranslationPair,
} from "./text-cleaning";

describe("cleanTranslationText", () => {
  it("removes repeated placeholder braces only from the text boundaries", () => {
    expect(cleanTranslationText("{} {}Specification{} {}"))
      .toBe("Specification");
    expect(cleanTranslationText("Alarm {} 333"))
      .toBe("Alarm {} 333");
  });

  it("decodes common entities and normalizes whitespace without DOM globals", () => {
    expect(cleanTranslationText("  Save&nbsp; &amp;  Close  "))
      .toBe("Save & Close");
  });
});

describe("TMX inline code tags", () => {
  it.each(["bpt", "ept", "ph", "it", "ut", "hi", "BPT"])(
    "recognizes %s as removable inline code",
    (tagName) => {
      expect(isInlineCodeTag(tagName)).toBe(true);
    },
  );

  it("does not classify ordinary nested markup as TMX inline code", () => {
    expect(isInlineCodeTag("span")).toBe(false);
  });
});

describe("shouldSkipTranslationPair", () => {
  it("filters XML and style payloads", () => {
    expect(shouldSkipTranslationPair(
      '</fill-sd><fill-sd val="&lt;a:solidFill&gt;&lt;a:srgbClr val=&quot;FF0000&quot;/&gt;">',
      "translated style",
    )).toBe(true);
    expect(shouldSkipTranslationPair(
      '<font latin="&lt;latin typeface=&quot;+mn-lt&quot;&gt;">',
      "translated font",
    )).toBe(true);
  });

  it.each([
    ["代码", "Code"],
    ["报警 333", "Alarm 333"],
    [
      "每三个月维护（或运行1250小时后进行维护）",
      "Quarterly maintenance, or maintenance after 1250 hours",
    ],
  ])("keeps natural-language labels: %s", (sourceText, targetText) => {
    expect(shouldSkipTranslationPair(sourceText, targetText)).toBe(false);
  });

  it("keeps an empty target but rejects an empty source", () => {
    expect(shouldSkipTranslationPair("Save", "")).toBe(false);
    expect(shouldSkipTranslationPair("", "Save")).toBe(true);
  });
});

describe("normalizeDuplicateKey", () => {
  it("normalizes case, whitespace, and non-breaking spaces", () => {
    expect(normalizeDuplicateKey("  Alarm\u00a0 333  "))
      .toBe("alarm 333");
  });
});
