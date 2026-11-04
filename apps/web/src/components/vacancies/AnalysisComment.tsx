/**
 * An analyzer comment, its `**zone headings**` in bold. For the analyzer's comments only: a
 * user's `**` stays as typed. Limit: bold only. Past that: react-markdown, here and in every
 * place that uses this, rather than growing the split by hand.
 */
export function AnalysisComment({ text }: { text: string }) {
  // The capture group puts each bold part at an odd index. No `s` flag, so a `**` left unpaired
  // on its line stays literal rather than pairing with one lines below.
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one string, never reordered
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}
