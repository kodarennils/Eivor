import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  parseInterviewMessage,
  mergeAnswers,
  determinePhase,
  gateRequest,
  checkDrawingReadiness,
  wrapupRoundTripComplete,
  validateRoomPercentages,
  enforceKontrollansvarigDisclosure,
  KONTROLLANSVARIG_DISCLAIMER,
  resolveSkipAheadRequested,
  wasAlreadyAskedAbout,
  textMatchesRequest,
  resolveDoneAndRequest,
  isUnusuallyLong,
  ensureDoneMessage,
  type InterviewPhase,
} from "@/lib/interview";
import { searchRegelverk, formatRegelverkContext } from "@/lib/regelverk";
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

// One focused instruction block per phase, instead of a flat 9-item list
// the model had to re-scan every turn to figure out what was still live.
// determinePhase() (lib/interview.ts, unit-tested) computes which of
// these is current from already-persisted answers - each block only
// needs to explain what to do RIGHT NOW, not track where it is itself.
const PHASE_INSTRUCTIONS: Record<Exclude<InterviewPhase, "kontrollansvarig" | "wrapup">, string> = {
  projectType: `Fråga vad de vill bygga eller ändra, om det inte redan framgår av den
ursprungliga beskrivningen ovan. Sätt "projectType" till exakt ett av:
${PROJECT_TYPE_OPTIONS.join(", ")}. Sätt samtidigt "description" till en
kort sammanfattning av projektet (1 mening) - härled den om möjligt
direkt från den ursprungliga beskrivningen ovan, utan att fråga separat.
"description" är frivilligt: fråga aldrig om den igen efter det här
steget, oavsett om den blev ifylld eller ej.`,

  matt: `Fråga om bredd, djup, ungefärlig yta och höjd till nock (allt i meter).
Anta inga mått själv - fråga, men acceptera ungefärliga svar ("typ 6
meter", "kanske 8 gånger 10"). Får gärna frågas i en och samma fråga.`,

  boundary: `Fråga hur långt det blir till närmaste tomtgräns, i meter.`,

  detaljplan: `Fråga om fastigheten omfattas av en detaljplan, med en kort mening
(t.ex. "Omfattas fastigheten av en detaljplan? Du kan också ladda upp
planen här.") och sätt "request" till "detaljplan-status" - det visar
Ja/Nej/Vet inte-knappar plus en uppladdningsruta för användaren. Svaret
kommer antingen som ett vanligt meddelande ("Ja", "Nej", "Jag vet inte")
eller som en automatisk bekräftelse att en fil laddats upp (vilket
innebär att svaret är "Ja") - tacka kort och gå vidare. Sätt
"withinDetailedPlan" till exakt ett av: ${YES_NO_UNKNOWN_OPTIONS.join(", ")}.`,

  rooms: `Fråga naturligt om rumsindelning, t.ex. "Hur många rum blir det, och
ungefär hur stor andel av ytan tar varje rum?". Bygg upp en lista med
rumstyp + ungefärlig procentandel (bör summera till ca 100%). Fråga också
hur många fönster det blir åt varje väderstreck (norr/öster/söder/väster)
och åt vilket håll huvudentrén vetter - får gärna frågas tillsammans.`,

  photos: `Be om ETT fasadfoto i taget för ett väderstreck som enligt listan nedan
saknas, med en kort konkret mening (t.ex. "Kan du ladda upp ett foto av
husets norra fasad?") och sätt "request" till "photo:norr" (eller
photo:öster / photo:söder / photo:väster). Be bara om ett foto per svar.
Ett laddat-upp-foto bekräftas automatiskt av systemet med ett meddelande
i konversationen ("Fasadfoto mot ... har laddats upp.") - tacka då kort
och gå vidare till nästa väderstreck, fråga inte om att få se bilden.`,

};

// Risk-inventory item #10: the two wrapup items are "frivilligt" and
// have no dedicated phase of their own to move past once satisfied, so
// wrapup can span several turns and the model could re-ask about
// fastighetsbeteckning (or situationsplan) on every one of them if it
// doesn't reliably track what it already asked. wasAlreadyAskedAbout()
// checks the real conversation history instead of trusting that - a
// clause is only included if it hasn't already been raised AND still
// isn't resolved.
function buildWrapupInstruction(
  messages: { role: "user" | "assistant"; content: string }[],
  propertyDesignationKnown: boolean,
  situationsplanResolved: boolean,
): string {
  const items: string[] = [];
  if (!propertyDesignationKnown && !wasAlreadyAskedAbout(messages, ["fastighetsbeteckning"])) {
    items.push(
      `- Fastighetsbeteckning, om den inte redan är känd - fråga högst en gång, tjata inte om de inte vet.`,
    );
  }
  if (
    !situationsplanResolved &&
    !wasAlreadyAskedAbout(messages, ["nybyggnadskarta", "situationsplan"])
  ) {
    items.push(
      `- Situationsplan: om den inte redan är sparad eller uttryckligen avböjd, fråga om de har en nybyggnadskarta att ladda upp och kalibrera och sätt "request" till "situationsplan" om ja.`,
    );
  }

  if (items.length === 0) {
    return `Grundfrågorna och de sista frivilliga sakerna (fastighetsbeteckning,
situationsplan) har redan avhandlats i konversationen - sätt "done": true
och skriv en kort sammanfattning av vad som samlats in i din vanliga text.`;
  }

  return `Grundfrågorna är klara. Sista frivilliga sak(er) att stämma av:
${items.join("\n")}
När det som återstår ovan är avklarat (svarat, uppladdat, eller avböjt),
sätt "done": true och skriv en kort sammanfattning av vad som samlats in
i din vanliga text.`;
}

function buildKontrollansvarigInstruction(regelverkContext: string): string {
  return `Du har ÄNNU INTE bedömt om det här ärendet troligen kräver en
certifierad kontrollansvarig. Använd ENDAST KONTROLLANSVARIG-REGELVERK
nedan för att avgöra det utifrån typ av åtgärd (och mått, om det är en
gränsdragningsfråga) - hitta inte på egna undantag. Sätt
"requiresKontrollansvarig" till exakt ett av ${YES_NO_UNKNOWN_OPTIONS.join(", ")}.
- Om "Ja": nämn det kort och sakligt i ditt svar, t.ex. "För det här
  ärendet krävs troligen en certifierad kontrollansvarig (KA). Du behöver
  utse en och ange deras kontaktuppgifter i din ansökan." och en kort
  mening om vad en KA gör, grundat på KONTROLLANSVARIG-REGELVERK. Avsluta
  sedan det här stycket med EXAKT denna mening, ordagrant:
  "${KONTROLLANSVARIG_DISCLAIMER}"
  Fråga sedan: "Har du redan utsett en kontrollansvarig? Om så, vad
  heter de och hur kontaktar man dem?" och nämn att de kan svara "Inte
  än" om de inte utsett någon. Fyll i
  "kontrollansvarigNamn"/"kontrollansvarigKontakt" om de ger det, annars
  inte - fråga bara en gång, tjata inte.
- Om "Nej" eller "Vet inte": nämn det kort i förbigående om det känns
  naturligt, men fråga INTE om namn/kontaktuppgifter.

KONTROLLANSVARIG-REGELVERK:

${regelverkContext}`;
}

function buildSystemPrompt(context: {
  initialDescription: string | null;
  assessmentSummary: string | null;
  knownAnswers: Record<string, unknown>;
  uploadedPhotos: Record<string, boolean>;
  situationsplanSaved: boolean;
  detaljplanSaved: boolean;
  phase: InterviewPhase;
  kontrollansvarigContext: string | null;
  drawingReadiness: { ready: boolean; missing: string[] };
  messages: { role: "user" | "assistant"; content: string }[];
}) {
  const photoStatus = DIRECTIONS.map(
    (d) => `${DIRECTION_LABEL[d]}: ${context.uploadedPhotos[d] ? "uppladdat" : "saknas"}`,
  ).join(", ");

  const activeInstruction =
    context.phase === "kontrollansvarig"
      ? buildKontrollansvarigInstruction(context.kontrollansvarigContext ?? "(inget underlag hittades)")
      : context.phase === "wrapup"
        ? buildWrapupInstruction(
            context.messages,
            Boolean(context.knownAnswers.propertyDesignation),
            context.situationsplanSaved,
          )
        : PHASE_INSTRUCTIONS[context.phase];

  return `Du är Eivor. Du har redan gjort en preliminär bygglovsbedömning åt den
här användaren. Nu samlar du in ALLT som behövs för att kunna rita upp
projektet och fylla i en bygglovsansökan - genom ett vanligt samtal. Nämn
aldrig fältnamn eller teknisk terminologi. Ställ en, max två, frågor per
svar. Kort och vardagligt tonläge.

Vad du redan vet om ärendet:
- Ursprunglig beskrivning: "${context.initialDescription ?? "(saknas)"}"
- Tidigare bedömning: "${context.assessmentSummary ?? "(saknas)"}"
- Redan kända uppgifter (fråga ALDRIG om dessa igen): ${JSON.stringify(context.knownAnswers)}
- Fasadfoton: ${photoStatus}
- Situationsplan: ${context.situationsplanSaved ? "sparad" : "saknas"}
- Detaljplan: ${context.detaljplanSaved ? "uppladdad" : "saknas"}

Just nu, fokusera ENDAST på detta:

${activeInstruction}

Övriga regler:
- Sätt "request" till null om du inte just nu ber om detaljplanestatus,
  ett specifikt foto, eller situationsplanen i just detta svar.
- Om det är första meddelandet i konversationen (inget tidigare
  användarsvar än): hälsa kort och ställ frågan ovan direkt.
- Svara alltid på svenska.
- Om användaren i sitt SENASTE meddelande uttryckligen ber om att hoppa
  fram - t.ex. "jag vill ha ritningar nu", "kan vi gå vidare till
  ritningarna", "skippa resten, generera nu" - sätt "skipAheadRequested":
  true och svara enligt STATUS FÖR RITNINGAR nedan ISTÄLLET för att bara
  fortsätta med fokusfrågan ovan (annars, sätt "skipAheadRequested":
  false och fortsätt som vanligt):
  - Om "redo": true nedan - bekräfta kort att det går bra att gå vidare.
    Nämn i förbigående att övrigt (t.ex. foton, rumsindelning) fortfarande
    är bra att ha men inte krävs för att komma igång.
  - Om "redo": false - säg TYDLIGT och SPECIFIKT vilka uppgifter i
    "saknas" nedan som fattas (använd exakt de orden, hitta inte på en
    egen lista) och fråga om de vill ange det nu eller om du ska
    fortsätta med de vanliga frågorna. Exempel: "Jag saknar fortfarande
    höjd till nock - vill du ange den nu, eller ska jag fortsätta med
    aktuella uppgifter?"

STATUS FÖR RITNINGAR: {"redo": ${context.drawingReadiness.ready}, "saknas": ${JSON.stringify(context.drawingReadiness.missing)}}

Efter VARJE svar, avsluta med ett kodblock i exakt detta format, på egen
rad. Ta ENDAST med fält/listor som är NYA eller har ÄNDRATS i just det
här svaret - upprepa INTE värden som redan är kända och oförändrade (de
finns redan sparade och försvinner inte). Utelämna fält du inte vet än
eller inte just nu uppdaterar (skriv inte tomma strängar eller tomma
listor):

\`\`\`json
{
  "answers": {
    "projectType": "...", "description": "...", "widthMeters": "...",
    "depthMeters": "...", "areaSqm": "...", "heightMeters": "...",
    "distanceToBoundaryMeters": "...", "withinDetailedPlan": "...",
    "propertyDesignation": "...",
    "rooms": [{"type": "...", "percentage": "..."}],
    "windowsPerDirection": {"norr": "...", "öster": "...", "söder": "...", "väster": "..."},
    "mainEntranceDirection": "...",
    "requiresKontrollansvarig": "...",
    "kontrollansvarigNamn": "...",
    "kontrollansvarigKontakt": "..."
  },
  "request": "photo:norr" | "photo:öster" | "photo:söder" | "photo:väster" | "situationsplan" | "detaljplan-status" | null,
  "done": true eller false,
  "skipAheadRequested": true eller false
}
\`\`\`

Sätt "done": true bara när instruktionen för wrapup-steget ovan säger åt
dig att göra det - inte tidigare. Situationsplan, detaljplan-filen och
kontrollansvarigs namn/kontakt är alltid frivilliga och krävs aldrig för
"done": true.`;
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

  const phase = determinePhase(existingAnswers, uploadedPhotos);
  const drawingReadiness = checkDrawingReadiness(existingAnswers);

  // Only look this up until the model has actually made the call once -
  // it's a fixed legal determination (PBL/PBF kontrollansvarig exemptions),
  // not something that varies enough per turn to re-search indefinitely.
  let kontrollansvarigContext: string | null = null;
  if (phase === "kontrollansvarig") {
    try {
      const matches = await searchRegelverk(
        "kontrollansvarig krävs undantag små åtgärder komplementbyggnad attefallshus anmälan bygglov",
        6,
      );
      kontrollansvarigContext = formatRegelverkContext(matches) || null;
    } catch (error) {
      console.error("Regelverkssökning för kontrollansvarig misslyckades:", error);
    }
  }

  const systemPrompt = buildSystemPrompt({
    initialDescription: project.initial_description,
    assessmentSummary: project.assessment_summary,
    knownAnswers: existingAnswers,
    uploadedPhotos,
    situationsplanSaved: Boolean(project.situationsplan_storage_path),
    detaljplanSaved: Boolean(project.detaljplan_storage_path),
    phase,
    kontrollansvarigContext,
    drawingReadiness,
    messages: messages as ChatMessage[],
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

    // #3: never let an ungrounded kontrollansvarig determination through,
    // and guarantee the "this is only information, never a substitute"
    // disclaimer actually reaches the user when the answer is "Ja" -
    // both previously depended entirely on the model following the
    // prompt.
    const disclosed = enforceKontrollansvarigDisclosure({
      phase,
      hasGroundingContext: Boolean(kontrollansvarigContext),
      text: parsed.text,
      answers: parsed.answers,
    });

    // #7: a room list that doesn't sum to ~100% renders a visibly broken
    // floor plan with nothing flagging why - reject it and let the
    // (still-active) rooms phase naturally re-prompt, rather than
    // persisting numbers the model itself was told to sanity-check.
    let finalText = disclosed.text;
    let finalAnswers = disclosed.answers;
    if (finalAnswers.rooms) {
      const roomCheck = validateRoomPercentages(finalAnswers.rooms);
      if (!roomCheck.valid) {
        finalText += `\n\nOBS: rumsindelningen du gav summerar till ca ${Math.round(roomCheck.sum)}% istället för ca 100% - kan du dubbelkolla procentandelarna?`;
        finalAnswers = { ...finalAnswers, rooms: undefined };
      }
    }

    const mergedAnswers = mergeAnswers(existingAnswers, finalAnswers);

    const { error: upsertError } = await supabase
      .from("project_answers")
      .upsert({ project_id: projectId, answers: mergedAnswers }, { onConflict: "project_id" });
    if (upsertError) {
      console.error("Kunde inte spara insamlade svar:", upsertError);
    }

    // #13: no reliable deterministic check exists for "1-2 frågor, kort
    // tonläge" or non-Swedish output (both would need either a second
    // model call or a heuristic with too high a false-positive rate to
    // trust) - length is the one honestly checkable piece, logged only,
    // never used to mutate the response (truncating risks cutting off
    // legally-relevant text mid-sentence).
    if (isUnusuallyLong(finalText)) {
      console.warn(`Interview response unusually long (${finalText.length} chars) for project ${projectId}`);
    }

    const latestUserMessage =
      [...(messages as ChatMessage[])].reverse().find((m) => m.role === "user")?.content ?? "";

    // #9: cross-check the model's own skipAheadRequested claim against
    // the user's actual latest message in both directions - see
    // resolveSkipAheadRequested() for what each direction guards against.
    const skipAheadRequested = resolveSkipAheadRequested(parsed.skipAheadRequested, latestUserMessage);

    // The model self-reports "done" in its JSON block, but it doesn't
    // reliably wait for the wrapup phase to say so (seen live: it
    // declared done right after the rooms phase, before any facade photo
    // existed). determinePhase() is the same deterministic source of
    // truth already used to build the prompt, so use it as a hard gate
    // instead of trusting the model's own claim.
    //
    // #4: phase alone wasn't enough either - requiring wrapup on BOTH
    // sides of the turn (wrapupRoundTripComplete) guarantees the model's
    // wrapup questions were actually shown to the user at least once
    // before done can fire, closing the "declares done on the very first
    // wrapup turn" gap observed earlier in testing.
    //
    // The one deliberate exception: an explicit skip-ahead request (e.g.
    // "jag vill ha ritningar nu") should surface the "Generera ritningar"
    // step immediately once the hard minimum for it exists, without
    // waiting for the rest of the linear phase sequence (photos, rooms,
    // wrapup) - checked against mergedAnswers so it also works when the
    // user supplies the missing figure in the very same message as the
    // request.
    const phaseAfterMerge = determinePhase(mergedAnswers, uploadedPhotos);
    const rawDone =
      (parsed.done && wrapupRoundTripComplete(phase, phaseAfterMerge)) ||
      (skipAheadRequested && checkDrawingReadiness(mergedAnswers).ready);

    // Same self-report problem as "done": the model can set e.g.
    // request:"photo:norr" while it was actually instructed to focus on
    // an earlier phase (seen live during the detaljplan phase, with reply
    // text that never asked for a photo). Gate against the phase it was
    // told to focus on this turn, not what it claims.
    //
    // #11: gateRequest only checks the request *value* against the
    // phase - textMatchesRequest additionally checks that the reply text
    // itself is actually about that request, closing the exact gap that
    // originally produced the photo-request bug (a request value that
    // passed its phase check but whose text never mentioned a photo).
    const gatedRequest = gateRequest(phase, parsed.request, uploadedPhotos);
    const rawRequest = textMatchesRequest(finalText, gatedRequest) ? gatedRequest : null;

    // #12: done and request were gated independently, so both could
    // legitimately survive at once (e.g. wrapup: done:true alongside
    // request:"situationsplan") - an incoherent combined UI state, not a
    // destructive one, but not intentional either. done wins.
    const { done, request } = resolveDoneAndRequest(rawDone, rawRequest);

    // The "text before the JSON block" formatting instruction is
    // occasionally violated (empty or JSON-first replies seen live) -
    // most turns that's barely noticeable, but on the turn done becomes
    // true it's the single most visible moment in the flow. Never show
    // nothing there.
    const message = ensureDoneMessage(finalText, done);

    return Response.json({
      message,
      answers: mergedAnswers,
      request,
      done,
    });
  } catch (error) {
    console.error("Anthropic API error:", error);
    return Response.json(
      { error: "Kunde inte hämta ett svar just nu. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
