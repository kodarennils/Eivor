import Anthropic from "@anthropic-ai/sdk";
import { searchRegelverk, formatRegelverkContext, type RegelverkMatch } from "@/lib/regelverk";
import {
  ARENDETYPER,
  ARENDETYP_LABEL,
  buildSearchQuery,
  type Arendetyp,
} from "@/lib/arendetyper";
import { createClient } from "@/lib/supabase/server";

const DETALJPLAN_DISCLAIMER =
  "Denna bedömning bygger på nationella regler – lokala detaljplanebestämmelser kan tillkomma.";

const MODEL = "claude-sonnet-5";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const MATCH_COUNT = 8;

const BASE_SYSTEM_PROMPT = `Du är Eivor, en AI-assistent som hjälper privatpersoner i Sverige att
förstå om ett byggprojekt troligen kräver bygglov enligt plan- och bygglagen (PBL).
Du hanterar alla typer av byggärenden - attefallshus/komplementbyggnad,
tillbyggnad av småhus, nybyggnad av huvudbyggnad (en-/tvåbostadshus),
fasadändring och åtgärder på tomten (altan, plank, mur, staket) - inte
bara ett specialfall.

Arbetssätt:
- Ställ korta, konkreta följdfrågor (en i taget) om du saknar information som är
  avgörande för bedömningen, t.ex. vad som ska byggas/ändras, mått (yta, höjd,
  avstånd till tomtgräns), om fastigheten ligger inom detaljplanerat område,
  om det är en- eller tvåbostadshus, samt om byggnaden eller området är
  kulturskyddat.
- Håll frågorna få och relevanta. Anta inte saker som besökaren inte sagt.
- Ärendet har redan klassificerats som "{{ARENDETYP}}" (se nedan) - låt det
  styra vilka regler som är relevanta, men lita på besökarens egen
  beskrivning om den pekar åt ett annat håll.
- Du får utdrag ur lagtext, Boverkets föreskrifter och vägledning nedan
  under "REGELVERKSKONTEXT". Basera din bedömning på dessa utdrag i första
  hand, framför din egen allmänna kunskap. Om utdragen inte täcker fallet,
  säg det istället för att gissa.
- Varje utdrag i REGELVERKSKONTEXT nedan inleds med en rad
  "CITAT ATT ANVÄNDA: (...)" - det är den exakta källhänvisningen för det
  utdraget. När du använder information från ett utdrag, skriv den texten
  ordagrant inom parentes rakt i svaret, t.ex. "(Plan- och bygglag 9 kap. 4 §)"
  eller "(Boverket, Bygglov för nybyggnad av komplementbyggnad)".
- Använd ALDRIG generiska eller numrerade källhänvisningar som "[7]",
  "källa 3" eller "enligt utdrag 2". Om du inte har en
  "CITAT ATT ANVÄNDA"-rad att koppla ett påstående till: hoppa över
  hänvisningen eller skriv om meningen utan att citera något - gissa
  aldrig fram en paragraf eller ett sidnummer. Citera bara sådant som
  faktiskt finns i REGELVERKSKONTEXT nedan.
{{DETALJPLAN_INSTRUCTION}}
- När du har tillräckligt underlag för en rimlig bedömning, ge ett tydligt
  svar i vardagligt, vänligt språk.
- Var alltid tydlig med att bedömningen är preliminär och inte ett formellt
  beslut – det slutgiltiga beslutet fattas av kommunens bygglovsenhet.
- Svara alltid på svenska.

Format på slutgiltigt svar:
När du har landat i en bedömning (kräver bygglov, kräver troligen inte
bygglov, eller går inte att avgöra utan mer information/en bygglovshandläggare),
avsluta ditt svar med ett kodblock i detta exakta format, på egen rad:

\`\`\`json
{"verdict": "kräver_bygglov" | "kräver_troligen_inte_bygglov" | "osäkert", "summary": "en mening som sammanfattar bedömningen"}
\`\`\`

Inkludera bara kodblocket när du faktiskt ger en bedömning, inte när du bara
ställer en följdfråga.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

async function classifyArendetyp(
  anthropic: Anthropic,
  caseDescription: string,
): Promise<Arendetyp> {
  try {
    const response = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 20,
      system: `Klassificera vilken typ av byggåtgärd ett svenskt bygglovsärende gäller.
Svara med EXAKT ett av dessa ord, inget annat: ${ARENDETYPER.join(", ")}.
Om informationen inte räcker för att avgöra typen, svara "ovrigt".`,
      messages: [{ role: "user", content: caseDescription }],
    });

    const text = response.content
      .find((block): block is Anthropic.TextBlock => block.type === "text")
      ?.text.trim()
      .toLowerCase();

    return (ARENDETYPER as readonly string[]).includes(text ?? "")
      ? (text as Arendetyp)
      : "ovrigt";
  } catch (error) {
    console.error("Klassificering av ärendetyp misslyckades:", error);
    return "ovrigt";
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

  const messages = (body as { messages?: unknown })?.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isValidMessage)
  ) {
    return Response.json({ error: "Ogiltiga meddelanden." }, { status: 400 });
  }

  const projectId = (body as { projectId?: unknown })?.projectId;
  let detaljplanText: string | null = null;
  if (typeof projectId === "string" && projectId) {
    // Authenticated + RLS-scoped: only returns a row if this project
    // belongs to the logged-in user. Anonymous chat has no session, so
    // this naturally resolves to null there.
    const supabase = await createClient();
    const { data: project } = await supabase
      .from("projects")
      .select("detaljplan_text")
      .eq("id", projectId)
      .maybeSingle();
    detaljplanText = project?.detaljplan_text ?? null;
  }

  const caseDescription = (messages as ChatMessage[])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const arendetyp = await classifyArendetyp(anthropic, caseDescription);
  const searchQuery = buildSearchQuery(arendetyp, caseDescription);

  let matches: RegelverkMatch[] = [];
  try {
    matches = await searchRegelverk(searchQuery, MATCH_COUNT);
  } catch (error) {
    console.error("Regelverkssökning misslyckades, fortsätter utan kontext:", error);
  }

  const detaljplanInstruction = detaljplanText
    ? `- Du har även fått utdrag ur den lokala detaljplanen för fastigheten
  nedan under "DETALJPLAN FÖR FASTIGHETEN" - den är specifik för det här
  ärendet, inte allmän lagtext. Väg in lokala bestämmelser därifrån (t.ex.
  om minskad/utökad lovplikt, kulör, höjd, placering) tillsammans med
  REGELVERKSKONTEXT.`
    : `- Ingen detaljplan för fastigheten har lämnats in. När du ger en
  slutgiltig bedömning, avsluta din brödtext (före kodblocket) med
  meningen exakt så här: "${DETALJPLAN_DISCLAIMER}"`;

  const promptWithArendetyp = BASE_SYSTEM_PROMPT.replace(
    "{{ARENDETYP}}",
    ARENDETYP_LABEL[arendetyp],
  ).replace("{{DETALJPLAN_INSTRUCTION}}", detaljplanInstruction);

  let systemPrompt = promptWithArendetyp;
  if (matches.length) {
    systemPrompt += `\n\nREGELVERKSKONTEXT:\n\n${formatRegelverkContext(matches)}`;
  }
  if (detaljplanText) {
    systemPrompt += `\n\nDETALJPLAN FÖR FASTIGHETEN:\n\n${detaljplanText}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return Response.json({
      message: text,
      arendetyp,
      usedDetaljplan: Boolean(detaljplanText),
      sources: matches.map((m) => ({
        source: m.source,
        type: m.type,
        paragraf_ref: m.paragraf_ref,
        valid_from: m.valid_from,
        similarity: m.similarity,
      })),
    });
  } catch (error) {
    console.error("Anthropic API error:", error);
    return Response.json(
      { error: "Kunde inte hämta ett svar just nu. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
