export type Verdict = "kräver_bygglov" | "kräver_troligen_inte_bygglov" | "osäkert";

export type ParsedAssistantMessage = {
  text: string;
  verdict?: Verdict;
  summary?: string;
};

const VERDICT_BLOCK = /```json\s*([\s\S]*?)\s*```/;
const VALID_VERDICTS: Verdict[] = [
  "kräver_bygglov",
  "kräver_troligen_inte_bygglov",
  "osäkert",
];

export function parseAssistantMessage(raw: string): ParsedAssistantMessage {
  const match = raw.match(VERDICT_BLOCK);
  if (!match) return { text: raw.trim() };

  try {
    const parsed = JSON.parse(match[1]);
    if (
      typeof parsed?.verdict === "string" &&
      VALID_VERDICTS.includes(parsed.verdict)
    ) {
      return {
        text: raw.slice(0, match.index).trim(),
        verdict: parsed.verdict,
        summary:
          typeof parsed.summary === "string" ? parsed.summary : undefined,
      };
    }
  } catch {
    // fall through and show the raw text if the block wasn't valid JSON
  }

  return { text: raw.trim() };
}
