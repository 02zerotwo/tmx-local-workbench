export const AI_SESSION_TITLE_MAX_LENGTH = 30;

export function createAiSessionTitle(
  content: string,
  maxLength = AI_SESSION_TITLE_MAX_LENGTH,
): string {
  const normalized = content.trim().replace(/\s+/gu, " ");
  const characters = Array.from(normalized);

  return characters.length > maxLength
    ? `${characters.slice(0, maxLength).join("")}…`
    : normalized;
}
