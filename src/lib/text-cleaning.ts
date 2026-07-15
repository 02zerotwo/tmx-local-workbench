const INLINE_CODE_TAGS = new Set(["bpt", "ept", "ph", "it", "ut", "hi"]);

export function isInlineCodeTag(tagName: string): boolean {
  return INLINE_CODE_TAGS.has(tagName.toLowerCase());
}

export function decodeCommonEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export function cleanTranslationText(value: string): string {
  let cleaned = decodeCommonEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned
    .replace(/^(?:\{\}\s*)+/, "")
    .replace(/(?:\s*\{\})+$/, "")
    .trim();

  return cleaned;
}

export function normalizeDuplicateKey(value: string): string {
  return cleanTranslationText(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldSkipTranslationPair(
  sourceText: string,
  targetText: string,
): boolean {
  if (!sourceText.trim()) {
    return true;
  }

  if (isCodeLikeText(sourceText)) {
    return true;
  }

  return targetText.trim().length > 0 && isCodeLikeText(targetText);
}

export function isCodeLikeText(value: string): boolean {
  const text = decodeCommonEntities(value).trim();

  if (!text) {
    return false;
  }

  if (/<\/?[a-z][\s/>][^>]*>/i.test(text)) {
    return true;
  }

  const lower = text.toLowerCase();
  const codeTokens = [
    "</",
    "/>",
    "xml:",
    "solidfill",
    "srgbclr",
    "typeface",
    "latin=",
    "val=",
    "font ",
    "fill-sd",
  ];
  const tokenHits = codeTokens.filter((token) => lower.includes(token)).length;

  if (tokenHits >= 2) {
    return true;
  }

  const symbolMatches = text.match(/[<>=/&;{}[\]"]/g) || [];
  const naturalMatches = text.match(/[\p{Script=Han}\p{Letter}\p{Number}]/gu) || [];

  return text.length > 20 && symbolMatches.length > naturalMatches.length;
}
