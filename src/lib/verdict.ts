export type Verdict = "kräver_bygglov" | "kräver_troligen_inte_bygglov" | "osäkert";

export const VERDICT_LABEL: Record<Verdict, string> = {
  kräver_bygglov: "Bygglov krävs troligen",
  kräver_troligen_inte_bygglov: "Bygglov krävs troligen inte",
  osäkert: "Går inte att avgöra ännu",
};

export const VERDICT_STYLE: Record<Verdict, string> = {
  kräver_bygglov: "bg-blue-50 text-blue-700 border-blue-200",
  kräver_troligen_inte_bygglov: "bg-emerald-50 text-emerald-700 border-emerald-200",
  osäkert: "bg-amber-50 text-amber-700 border-amber-200",
};

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
