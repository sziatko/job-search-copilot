/** Shorter posting text, trimmed, is taken as none: a login wall or captcha page, not a
 * posting. Text is never overwritten, so storing it would block the real one. Every path
 * that writes `fullText` (intake, `save()`) goes through here. */
export const MIN_TEXT_LENGTH = 200;

export function usablePostingText(raw: string | null | undefined): string | null {
  return raw && raw.trim().length >= MIN_TEXT_LENGTH ? raw : null;
}
