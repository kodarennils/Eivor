import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { searchRegelverk, formatRegelverkContext } from "@/lib/regelverk";

const MODEL = "claude-sonnet-5";

const JSON_BLOCK = /```json\s*([\s\S]*?)\s*```/;

export type KontrollplanPunkt = {
  kontrollpunkt: string;
  utforsAv: string;
  nar: string;
};

function buildFacts(answers: Record<string, unknown>): string {
  const facts: string[] = [];
  if (answers.projectType) facts.push(`Typ av åtgärd: ${answers.projectType}`);
  if (answers.description) facts.push(`Beskrivning: ${answers.description}`);
  if (answers.widthMeters || answers.depthMeters) {
    facts.push(`Mått: ${answers.widthMeters ?? "?"} x ${answers.depthMeters ?? "?"} meter`);
  }
  if (answers.heightMeters) facts.push(`Höjd till nock: ${answers.heightMeters} meter`);
  if (answers.withinDetailedPlan) {
    facts.push(`Inom detaljplanerat område: ${answers.withinDetailedPlan}`);
  }
  return facts.join("\n") || "Inga ytterligare uppgifter angivna.";
}

function parsePunkter(raw: string): KontrollplanPunkt[] {
  const match = raw.match(JSON_BLOCK) ?? raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1] ?? match[0]);
    if (!Array.isArray(parsed?.punkter)) return [];
    return parsed.punkter
      .filter(
        (p: unknown): p is Record<string, unknown> => typeof p === "object" && p !== null,
      )
      .map((p: Record<string, unknown>) => ({
        kontrollpunkt: typeof p.kontrollpunkt === "string" ? p.kontrollpunkt : "",
        utforsAv: typeof p.utforsAv === "string" ? p.utforsAv : "",
        nar: typeof p.nar === "string" ? p.nar : "",
      }))
      .filter((p: KontrollplanPunkt) => p.kontrollpunkt);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Servern saknar konfiguration (ANTHROPIC_API_KEY)." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const projectId = (body as { projectId?: unknown })?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    return Response.json({ error: "Ärende saknas." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  // RLS also protects this, but check explicitly for a clean error message.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return Response.json({ error: "Hittade inte ärendet." }, { status: 404 });
  }

  const { data: answerRow } = await supabase
    .from("project_answers")
    .select("answers")
    .eq("project_id", projectId)
    .maybeSingle();
  const answers = (answerRow?.answers ?? {}) as Record<string, unknown>;
  const projectType = (answers.projectType as string) || "byggåtgärd";

  let context = "";
  try {
    const matches = await searchRegelverk(
      `kontrollplan kontrollpunkter kontrollansvarig egenkontroll byggherre ${projectType} grundläggning bärande konstruktion brandskydd fuktskydd ventilation`,
      8,
    );
    context = formatRegelverkContext(matches);
  } catch (error) {
    console.error("Regelverkssökning för kontrollplan misslyckades:", error);
  }

  if (!context) {
    return Response.json(
      { error: "Hittade inget underlag i regelverket för att ta fram en kontrollplan just nu." },
      { status: 502 },
    );
  }

  const systemPrompt = `Du är Eivor. Ta fram ett FÖRSLAG till kontrollplan enligt
plan- och bygglagen för det här ärendet, grundat på REGELVERKSKONTEXT nedan.
Hitta inte på kontrollpunkter som varken har stöd i REGELVERKSKONTEXT eller
är allmänt vedertagen byggpraxis för just den här typen av åtgärd - anpassa
listan efter vad som faktiskt byggs.

Ärendets uppgifter:
${buildFacts(answers)}

REGELVERKSKONTEXT:

${context}

Ta fram kontrollpunkter relevanta för just den här typen av åtgärd (t.ex.
för en tillbyggnad: grundläggning, bärande konstruktion, brandskydd,
fuktskydd, ventilation - men hoppa över det som uppenbart inte är relevant
för det som beskrivs, och lägg till annat som är relevant istället). För
varje punkt, ange:
- kontrollpunkt: vad som ska kontrolleras, kort och konkret
- utforsAv: vem som utför kontrollen - "Byggherren (egenkontroll)",
  "Kontrollansvarig" eller "Entreprenören", beroende på vad som är rimligt
- nar: när i byggprocessen kontrollen sker, t.ex. "Innan byggstart",
  "Under byggtiden" eller "Efter färdigställande"

Svara ENDAST med ett JSON-objekt i exakt detta format, inget annat text:

\`\`\`json
{"punkter": [{"kontrollpunkt": "...", "utforsAv": "...", "nar": "..."}]}
\`\`\``;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: "Ta fram kontrollplanen." }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const punkter = parsePunkter(text);
    if (punkter.length === 0) {
      return Response.json(
        { error: "Kunde inte ta fram en kontrollplan just nu. Försök igen." },
        { status: 502 },
      );
    }

    return Response.json({ punkter });
  } catch (error) {
    console.error("Anthropic API error (kontrollplan):", error);
    return Response.json(
      { error: "Kunde inte ta fram en kontrollplan just nu. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
