// NL-2: turns a natural-language drawing-edit instruction ("flytta
// fönstret på norra väggen 50 cm åt vänster") into a structured edit
// against the same DrawingModel windows/doors ids already used
// everywhere else (Phase C/D, lib/drawing-schema.ts). The model only
// ever describes WHAT to change and by how much - the actual geometry
// (in particular the left/right sign convention derived and proven in
// NL-1, leftRightOffsetDeltaMm) is applied downstream in NL-3, never
// trusted from the model's own arithmetic. Same discipline as the rest
// of this codebase's deterministic gates (ENUM_FIELDS, gateRequest,
// etc. in interview.ts): the model's JSON is validated against the real
// model before anything downstream can act on it, never passed through
// on trust.

import type { DrawingModel, Wall, Window, Door } from "@/lib/drawing-schema";
import { DIRECTION_LABEL, type Direction } from "@/lib/project-fields";

export type EditableField = "offsetMm" | "widthMm" | "heightMm" | "sillHeightMm";

export type ParsedRitEdit =
  | { targetId: string; field: "offsetMm"; mode: "moveDirection"; direction: "left" | "right"; magnitudeMm: number }
  | { targetId: string; field: "offsetMm"; mode: "absolute"; valueMm: number }
  | { targetId: string; field: Exclude<EditableField, "offsetMm">; mode: "absolute"; valueMm: number }
  | { targetId: string; field: Exclude<EditableField, "offsetMm">; mode: "delta"; deltaMm: number };

export type RitEditResult =
  | { status: "ok"; message: string; edit: ParsedRitEdit }
  | { status: "needsClarification"; message: string; candidateIds: string[] }
  | { status: "unsupported"; message: string };

// Shared between the route (server-side cap, applied by slicing to the
// most recent turns rather than rejecting the whole history on overflow
// - see route.ts) and the client (NL-4's RitEditChat, which caps what it
// even bothers sending) so the two can't silently drift apart.
export const MAX_RIT_EDIT_HISTORY = 20;

const JSON_BLOCK = /```json\s*([\s\S]*?)\s*```/;

function directionLabel(wallId: string): string {
  const direction = wallId.replace(/^wall-/, "") as Direction;
  return DIRECTION_LABEL[direction] ?? wallId;
}

// Renders every window/door as one line the model can ground a reference
// against ("fönstret på norra väggen", "det andra fönstret på söder",
// "dörren") - always includes the real id so the model's answer only
// ever needs to echo it back, never re-derive or re-spell it.
export function describeDrawingModelForPrompt(model: DrawingModel): string {
  const lines: string[] = [];
  for (const window of model.windows) {
    const sameWall = model.windows.filter((w) => w.wallId === window.wallId);
    const index = sameWall.findIndex((w) => w.id === window.id) + 1;
    const positionNote =
      sameWall.length > 1 ? ` (fönster ${index} av ${sameWall.length} på den väggen)` : "";
    lines.push(
      `- id="${window.id}": fönster på vägg ${directionLabel(window.wallId)}${positionNote}, ` +
        `offset ${window.offsetMm}mm, bredd ${window.widthMm}mm, höjd ${window.heightMm}mm, brösthöjd ${window.sillHeightMm}mm`,
    );
  }
  for (const door of model.doors) {
    lines.push(
      `- id="${door.id}": dörr på vägg ${directionLabel(door.wallId)}, ` +
        `offset ${door.offsetMm}mm, bredd ${door.widthMm}mm, höjd ${door.heightMm}mm`,
    );
  }
  return lines.length ? lines.join("\n") : "(inga fönster eller dörrar i ritningen än)";
}

// KNOWN OPEN ISSUE (reported live in-browser, not yet fixed - do not
// "fix" this without explicit sign-off, per the conversation this was
// logged in): resolving which element a LABEL like "vänstra fönstret"
// (the left window) refers to, among two+ candidates, is unreliable and
// has been observed to disagree with this codebase's own derived
// left/right convention (leftRightOffsetDeltaMm in drawing-schema.ts:
// LEFT = INCREASING offsetMm, uniformly on every wall).
//
// Reproduced live against SAMPLE_DRAWING_MODEL (window-1 at offsetMm
// 800, window-2 at offsetMm 4000, both on wall-norr): "Flytta det
// vänstra fönstret på norr 30 cm åt höger" was answered two different
// ways across otherwise-identical runs -
//   - once by confidently picking window-1 (the LOWER offset) as "the
//     left window" - backwards from the derived convention, which says
//     window-2 (the HIGHER offset) is the one further left;
//   - once by correctly recognizing the reference was ambiguous and
//     asking for clarification instead of guessing.
//
// This is a DIFFERENT code path from the "vänster"/"höger" instruction
// just below, which only ever asks the model to pass the word "left"/
// "right" through unchanged for a MOVE direction (never to resolve it
// itself) - deliberately, so the model's own arithmetic is never
// trusted for that. Nothing in this prompt currently tells the model
// how to resolve a left/right LABEL used to pick a candidate, which is
// presumably why it's improvising (and improvising inconsistently). A
// fix likely belongs here (teach the model the same convention
// leftRightOffsetDeltaMm encodes, for identification too) or in
// describeDrawingModelForPrompt (annotate each candidate with its own
// resolved left/right position up front, so the model never has to
// derive it). Left open intentionally.
export function buildRitEditSystemPrompt(model: DrawingModel): string {
  return `Du hjälper en användare redigera en byggritning genom vanligt tal. Du
ändrar ALDRIG ritningen själv - du tolkar bara vad användaren vill och
returnerar en strukturerad instruktion som ett annat system sedan utför.

Befintliga fönster och dörrar i ritningen (referera ALLTID till dessa via
deras id, hitta aldrig på ett eget id):
${describeDrawingModelForPrompt(model)}

Vad du får tolka:
- Flytta ett befintligt fönster/dörr längs sin egen vägg, antingen
  relativt ("åt vänster", "åt höger" - ange riktning + sträcka i
  millimeter) eller till ett exakt mått från väggens startpunkt.
- Ändra bredd, höjd, eller brösthöjd på ett befintligt fönster/dörr,
  antingen till ett exakt mått eller en relativ ändring (t.ex. "gör den
  bredare", "sänk brösthöjden 10 cm"). Saknas en sträcka/mått helt (t.ex.
  bara "gör den bredare" utan tal) - anta en måttlig ändring (ca 200mm)
  och nämn det du antog i "message".

Vad du INTE får göra - svara "unsupported" med en kort, saklig
förklaring i "message" om användaren ber om något av detta:
- Lägga till eller ta bort fönster/dörrar.
- Ändra väggarnas placering/mått, taknockshöjd, eller något annat än ett
  befintligt fönster/dörrs läge eller mått.
- Vad som helst som inte är en redigering av den här ritningen.
- Flera olika ändringar i samma meddelande (t.ex. både flytta OCH ändra
  storlek på samma gång) - be användaren beskriva en ändring i taget
  istället för att bara utföra en av dem och ignorera resten.

Om instruktionen är tvetydig - matchar två eller fler element lika väl
(t.ex. "fönstret på norr" när det finns två) - svara "needsClarification"
med en kort fråga i "message" och lista ALLA rimliga kandidaters id i
"candidateIds". Gissa aldrig vid genuin tvetydighet.

"vänster"/"höger" avser alltid användarens naturliga perspektiv, sett
utifrån och in mot huset. Du behöver bara återge ordet "left" eller
"right" oförändrat i "direction" - den faktiska uträkningen av vilken
riktning det motsvarar på respektive vägg sker i ett senare steg, gör
den inte själv.

"magnitudeMm", "valueMm" och "deltaMm" (för offsetMm/moveDirection resp.
absolute) ska ALLTID vara icke-negativa tal - ett negativt tal där är
alltid fel. Om användaren själv anger ett negativt mått för en flytt
(t.ex. "-500mm åt vänster"), tolka det som en flytt i motsatt riktning
med motsvarande positiva belopp istället (byt "direction", inte
tecknet på talet).

Svara ENDAST med ett JSON-block i exakt detta format, ingen text utanför
blocket:

\`\`\`json
{
  "status": "ok" | "needsClarification" | "unsupported",
  "message": "kort, naturlig svensk text till användaren - en bekräftelse (status ok), en fråga (needsClarification), eller en förklaring (unsupported)",
  "edit": {
    "targetId": "t.ex. norr-win-1",
    "field": "offsetMm" | "widthMm" | "heightMm" | "sillHeightMm",
    "mode": "moveDirection" | "absolute" | "delta",
    "direction": "left" | "right",
    "magnitudeMm": 500,
    "valueMm": 1200,
    "deltaMm": 200
  },
  "candidateIds": ["norr-win-1", "norr-win-2"]
}
\`\`\`

Ta bara med de under-fält i "edit" som hör till vald "mode": moveDirection
behöver "direction" + "magnitudeMm", absolute behöver "valueMm", delta
behöver "deltaMm" (positivt tal = öka, negativt = minska). Utelämna
"edit" helt vid needsClarification/unsupported, och "candidateIds" helt
utom vid needsClarification.`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is { xMm: number; yMm: number } {
  if (typeof value !== "object" || value === null) return false;
  const { xMm, yMm } = value as Record<string, unknown>;
  return isFiniteNumber(xMm) && isFiniteNumber(yMm);
}

function isWall(value: unknown): value is Wall {
  if (typeof value !== "object" || value === null) return false;
  const { id, start, end } = value as Record<string, unknown>;
  return typeof id === "string" && Boolean(id) && isPoint(start) && isPoint(end);
}

function isWindow(value: unknown): value is Window {
  if (typeof value !== "object" || value === null) return false;
  const { id, wallId, offsetMm, widthMm, heightMm, sillHeightMm } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    Boolean(id) &&
    typeof wallId === "string" &&
    isFiniteNumber(offsetMm) &&
    isFiniteNumber(widthMm) &&
    isFiniteNumber(heightMm) &&
    isFiniteNumber(sillHeightMm)
  );
}

function isDoor(value: unknown): value is Door {
  if (typeof value !== "object" || value === null) return false;
  const { id, wallId, offsetMm, widthMm, heightMm } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    Boolean(id) &&
    typeof wallId === "string" &&
    isFiniteNumber(offsetMm) &&
    isFiniteNumber(widthMm) &&
    isFiniteNumber(heightMm)
  );
}

// A client-supplied model (the browser's own edited-in-session state, not
// something re-fetched from the DB - see page.tsx's editedDrawingModel)
// is validated the same way any other untrusted request body is
// elsewhere in this codebase, rather than trusted to build a prompt or
// pass validateEdit's targetId-existence checks against.
export function isValidDrawingModel(value: unknown): value is DrawingModel {
  if (typeof value !== "object" || value === null) return false;
  const { walls, windows, doors, roofRidgeHeightMm } = value as Record<string, unknown>;
  return (
    Array.isArray(walls) &&
    walls.every(isWall) &&
    Array.isArray(windows) &&
    windows.every(isWindow) &&
    Array.isArray(doors) &&
    doors.every(isDoor) &&
    isFiniteNumber(roofRidgeHeightMm)
  );
}

function validateEdit(raw: unknown, model: DrawingModel): ParsedRitEdit | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { targetId, field, mode, direction, magnitudeMm, valueMm, deltaMm } = raw as Record<
    string,
    unknown
  >;

  if (typeof targetId !== "string" || !targetId) return null;
  const targetIsWindow = model.windows.some((w) => w.id === targetId);
  const targetIsDoor = model.doors.some((d) => d.id === targetId);
  if (!targetIsWindow && !targetIsDoor) return null;

  if (field !== "offsetMm" && field !== "widthMm" && field !== "heightMm" && field !== "sillHeightMm") {
    return null;
  }
  // Door has no sillHeightMm field (a door starts at the floor by
  // definition - see drawing-schema.ts) - "brösthöjd" only means
  // anything for a window, so a door target here is self-contradictory
  // and must not be trusted, same as any other malformed combination.
  if (field === "sillHeightMm" && !targetIsWindow) return null;

  if (mode === "moveDirection") {
    // offsetMm deltas only ever arrive via moveDirection - see NL-1's
    // leftRightOffsetDeltaMm, the whole reason this mode exists is to
    // keep the sign convention out of the model's hands entirely.
    if (field !== "offsetMm") return null;
    if (direction !== "left" && direction !== "right") return null;
    if (!isFiniteNumber(magnitudeMm) || magnitudeMm < 0) return null;
    return { targetId, field: "offsetMm", mode: "moveDirection", direction, magnitudeMm };
  }
  if (mode === "absolute") {
    if (!isFiniteNumber(valueMm) || valueMm < 0) return null;
    return field === "offsetMm"
      ? { targetId, field: "offsetMm", mode: "absolute", valueMm }
      : { targetId, field, mode: "absolute", valueMm };
  }
  if (mode === "delta") {
    if (field === "offsetMm") return null;
    if (!isFiniteNumber(deltaMm)) return null;
    return { targetId, field, mode: "delta", deltaMm };
  }
  return null;
}

const FALLBACK_MESSAGE =
  "Jag kunde tyvärr inte tolka det där som en ändring av ritningen. Kan du beskriva det på ett annat sätt?";

// Never trusts the model's JSON at face value - same discipline as
// parseInterviewMessage/ENUM_FIELDS elsewhere in this codebase. A
// malformed or self-contradictory block (unknown targetId, a mode that
// doesn't match its own sub-fields, a NaN/negative measurement, a
// "clarification" that doesn't actually name 2+ real candidates) is
// treated as a failure to parse, not silently coerced - callers get
// "unsupported" rather than an edit that could corrupt the drawing.
export function parseRitEditResponse(raw: string, model: DrawingModel): RitEditResult {
  const fallback: RitEditResult = { status: "unsupported", message: FALLBACK_MESSAGE };

  const match = raw.match(JSON_BLOCK);
  if (!match) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return fallback;
  }
  if (typeof parsed !== "object" || parsed === null) return fallback;

  const { status, message } = parsed as Record<string, unknown>;
  const text = typeof message === "string" && message.trim() ? message.trim() : FALLBACK_MESSAGE;

  if (status === "needsClarification") {
    const candidateIdsRaw = (parsed as Record<string, unknown>).candidateIds;
    const candidateIds = Array.isArray(candidateIdsRaw)
      ? candidateIdsRaw.filter(
          (id): id is string =>
            typeof id === "string" &&
            (model.windows.some((w) => w.id === id) || model.doors.some((d) => d.id === id)),
        )
      : [];
    // A "clarification" that doesn't actually name 2+ real elements isn't
    // a genuine ambiguity - showing it would be a dead-end question, so
    // treat it as a parse failure instead.
    if (candidateIds.length < 2) return fallback;
    return { status: "needsClarification", message: text, candidateIds };
  }

  if (status === "ok") {
    const edit = validateEdit((parsed as Record<string, unknown>).edit, model);
    if (!edit) return fallback;
    return { status: "ok", message: text, edit };
  }

  if (status === "unsupported") {
    return { status: "unsupported", message: text };
  }

  return fallback;
}
