import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { parseInterviewMessage, mergeAnswers } from "@/lib/interview";
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  PROJECT_TYPE_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
} from "@/lib/project-fields";

const MODEL = "claude-sonnet-5";
const MAX_MESSAGES = 60;
const MAX_MESSAGE_LENGTH = 2000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function isValidMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= MAX_MESSAGE_LENGTH
  );
}

function buildSystemPrompt(context: {
  initialDescription: string | null;
  assessmentSummary: string | null;
  knownAnswers: Record<string, unknown>;
  uploadedPhotos: Record<string, boolean>;
  situationsplanSaved: boolean;
  detaljplanSaved: boolean;
}) {
  const photoStatus = DIRECTIONS.map(
    (d) => `${DIRECTION_LABEL[d]}: ${context.uploadedPhotos[d] ? "uppladdat" : "saknas"}`,
  ).join(", ");

  return `Du är Eivor. Du har redan gjort en preliminär bygglovsbedömning åt den
här användaren. Nu samlar du in ALLT som behövs för att kunna rita upp
projektet och fylla i en bygglovsansökan - genom ett vanligt samtal. Nämn
aldrig fältnamn eller teknisk terminologi.

Vad du redan vet om ärendet:
- Ursprunglig beskrivning: "${context.initialDescription ?? "(saknas)"}"
- Tidigare bedömning: "${context.assessmentSummary ?? "(saknas)"}"
- Redan kända uppgifter (fråga ALDRIG om dessa igen): ${JSON.stringify(context.knownAnswers)}
- Fasadfoton: ${photoStatus}
- Situationsplan: ${context.situationsplanSaved ? "sparad" : "saknas"}
- Detaljplan: ${context.detaljplanSaved ? "uppladdad" : "saknas"}

Samla in, i ungefär denna ordning, och hoppa alltid över det som redan är
känt eller redan besvarats i konversationen:

1. Typ av åtgärd - ska till slut motsvara exakt ett av:
   ${PROJECT_TYPE_OPTIONS.join(", ")}.
2. Mått: bredd, djup, ungefärlig yta, höjd till nock (allt i meter).
3. Avstånd till närmaste tomtgräns (meter).
4. Om fastigheten ligger inom detaljplanerat område - ska motsvara exakt
   ett av: ${YES_NO_UNKNOWN_OPTIONS.join(", ")}. Fråga med en kort mening
   (t.ex. "Omfattas fastigheten av en detaljplan? Du kan också ladda upp
   planen här.") och sätt "request" till "detaljplan-status" - det visar
   Ja/Nej/Vet inte-knappar plus en uppladdningsruta för användaren. Om
   frågan redan är besvarad eller en detaljplan-fil redan är uppladdad
   enligt listan ovan, hoppa över och sätt inte "request" till detta igen.
   Svaret kommer antingen som ett vanligt meddelande ("Ja", "Nej", "Jag
   vet inte") eller som en automatisk bekräftelse att en fil laddats upp
   (vilket innebär att svaret är "Ja") - tacka kort och gå vidare.
5. Fastighetsbeteckning (frivilligt - fråga högst en gång, tjata inte om
   de inte vet).
6. OM typen av åtgärd är en tillbyggnad, nybyggnad eller ett attefallshus
   (en byggnad som behöver en invändig planritning) - fråga naturligt om
   rumsindelning, t.ex. "Hur många rum blir det, och ungefär hur stor
   andel av ytan tar varje rum?". Bygg löpande upp en lista med rumstyp +
   ungefärlig procentandel (bör summera till ca 100%). Fråga också hur
   många fönster det blir åt varje väderstreck (norr/öster/söder/väster)
   och åt vilket håll huvudentrén vetter. Hoppa över detta steg helt för
   fasadändring, altan/uterum eller annat som inte har en invändig
   planlösning.
7. Fasadfoton, ett väderstreck i taget: när du är redo att be om ett foto
   för ett väderstreck som enligt listan ovan saknas, skriv en kort,
   konkret mening som ber om just det fotot (t.ex. "Kan du ladda upp ett
   foto av husets norra fasad?") och sätt "request" till "photo:norr"
   (eller photo:öster / photo:söder / photo:väster). Be bara om ett foto
   per svar. Ett laddat-upp-foto bekräftas automatiskt av systemet med ett
   meddelande i konversationen ("Fasadfoto mot ... har laddats upp.") -
   tacka då kort och gå vidare till nästa väderstreck eller nästa steg,
   fråga inte om att få se bilden.
8. Situationsplan (frivilligt): när mått och avstånd till tomtgräns är
   kända och situationsplan saknas enligt listan ovan, fråga om
   användaren har en nybyggnadskarta att ladda upp och kalibrera. Om ja,
   sätt "request" till "situationsplan". Om användaren säger att de inte
   har någon karta (eller redan sagt det tidigare i konversationen), gå
   vidare utan att fråga igen.

Regler:
- Ställ en, max två, frågor per svar. Kort och vardagligt tonläge.
- Anta inga mått eller avstånd själv - fråga, men acceptera ungefärliga
  svar ("typ 6 meter", "kanske 8 gånger 10").
- Sätt "request" till null i alla lägen utom precis när du bett om
  detaljplanestatus, ett specifikt foto eller situationsplanen i just
  detta svar.
- Om det är första meddelandet i konversationen (inget tidigare
  användarsvar än): hälsa kort och ställ din första fråga direkt, utifrån
  vad som redan är känt.
- Svara alltid på svenska.

Efter VARJE svar, avsluta med ett kodblock i exakt detta format, på egen
rad. Ta alltid med ALLA fält/listor du känner till totalt sett (inte bara
det som kom fram i senaste svaret - upprepa tidigare kända värden och
listor också), och utelämna fält du inte vet än (skriv inte tomma
strängar eller tomma listor):

\`\`\`json
{
  "answers": {
    "projectType": "...", "description": "...", "widthMeters": "...",
    "depthMeters": "...", "areaSqm": "...", "heightMeters": "...",
    "distanceToBoundaryMeters": "...", "withinDetailedPlan": "...",
    "propertyDesignation": "...",
    "rooms": [{"type": "...", "percentage": "..."}],
    "windowsPerDirection": {"norr": "...", "öster": "...", "söder": "...", "väster": "..."},
    "mainEntranceDirection": "..."
  },
  "request": "photo:norr" | "photo:öster" | "photo:söder" | "photo:väster" | "situationsplan" | "detaljplan-status" | null,
  "done": true eller false
}
\`\`\`

Sätt "done": true först när: bredd, djup, yta, höjd, avstånd till
tomtgräns och detaljplanestatus (svaret Ja/Nej/Vet inte, inte samma sak
som uppladdad detaljplan-fil) är ifyllda, OCH (om rumsindelning krävs för
den här ärendetypen enligt punkt 6) rumsindelning, fönster och huvudentré
är ifyllda, OCH alla fyra fasadfoton är uppladdade enligt listan ovan.
Situationsplan och detaljplan-filen är frivilliga och krävs INTE för
"done": true. Skriv en kort sammanfattning av vad som samlats in i din
vanliga text när du sätter "done": true.`;
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

  const messages = (body as { messages?: unknown })?.messages;
  if (
    !Array.isArray(messages) ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isValidMessage)
  ) {
    return Response.json({ error: "Ogiltiga meddelanden." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  const [{ data: project }, { data: answerRow }, { data: imageRows }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "initial_description, assessment_summary, situationsplan_storage_path, detaljplan_storage_path",
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("project_answers").select("answers").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_images").select("direction").eq("project_id", projectId),
  ]);

  if (!project) {
    return Response.json({ error: "Ärendet hittades inte." }, { status: 404 });
  }

  const existingAnswers = (answerRow?.answers ?? {}) as Record<string, unknown>;
  const uploadedPhotos = Object.fromEntries(
    DIRECTIONS.map((d) => [d, (imageRows ?? []).some((r) => r.direction === d)]),
  );

  const systemPrompt = buildSystemPrompt({
    initialDescription: project.initial_description,
    assessmentSummary: project.assessment_summary,
    knownAnswers: existingAnswers,
    uploadedPhotos,
    situationsplanSaved: Boolean(project.situationsplan_storage_path),
    detaljplanSaved: Boolean(project.detaljplan_storage_path),
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: systemPrompt,
      messages: messages.length
        ? (messages as ChatMessage[])
        : [{ role: "user", content: "Hej, jag är redo att svara på frågor." }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const parsed = parseInterviewMessage(text);
    const mergedAnswers = mergeAnswers(existingAnswers, parsed.answers);

    const { error: upsertError } = await supabase
      .from("project_answers")
      .upsert({ project_id: projectId, answers: mergedAnswers }, { onConflict: "project_id" });
    if (upsertError) {
      console.error("Kunde inte spara insamlade svar:", upsertError);
    }

    return Response.json({
      message: parsed.text,
      answers: mergedAnswers,
      request: parsed.request,
      done: parsed.done,
    });
  } catch (error) {
    console.error("Anthropic API error:", error);
    return Response.json(
      { error: "Kunde inte hämta ett svar just nu. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
