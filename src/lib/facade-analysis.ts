// Extracts visual attributes (material, colour) from a facade photo using
// Claude's vision. This is used purely for text annotations on the
// drawing - it never influences the drawing's geometry, which comes only
// from the user-entered measurements (see drawing.ts).

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

export type FacadeAttributes = {
  material: string;
  color: string;
};

function mimeTypeFromPath(path: string): "image/jpeg" | "image/png" | "image/webp" {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function analyzeFacadePhoto(
  imageBytes: Uint8Array,
  storagePath: string,
): Promise<FacadeAttributes> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mediaType = mimeTypeFromPath(storagePath);
  const base64 = Buffer.from(imageBytes).toString("base64");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 100,
    system: `Du analyserar ett foto av en husfasad. Identifiera fasadmaterial (t.ex.
"träpanel", "puts", "tegel", "plåt", "sten") och kulör (t.ex. "vit", "rödbrun",
"grå", "gul") baserat enbart på vad som syns på bilden.

Svara ENDAST med ett JSON-objekt på exakt detta format, inget annat text:
{"material": "...", "color": "..."}

Om du är osäker, gör din bästa bedömning utifrån vad som syns.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Analysera fasaden på bilden." },
        ],
      },
    ],
  });

  const text = response.content
    .find((block): block is Anthropic.TextBlock => block.type === "text")
    ?.text.trim();

  try {
    const match = text?.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}");
    return {
      material: typeof parsed.material === "string" ? parsed.material : "okänt",
      color: typeof parsed.color === "string" ? parsed.color : "okänd",
    };
  } catch (error) {
    console.error("Kunde inte tolka fasadanalysens svar:", text, error);
    return { material: "okänt", color: "okänd" };
  }
}
