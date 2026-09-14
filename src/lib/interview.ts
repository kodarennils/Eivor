import {
  DIRECTIONS,
  PROJECT_TYPE_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
  type Direction,
  type Room,
} from "@/lib/project-fields";
import { parseSwedishNumber } from "@/lib/swedish-number";

// Everything the conversational collector can fill in - the full
// project_answers shape except that rooms/windowsPerDirection are only
// asked about when the project type needs a floor plan (the model decides
// that itself from context, not hardcoded here).
export type InterviewAnswers = {
  projectType?: string;
  description?: string;
  widthMeters?: string;
  depthMeters?: string;
  areaSqm?: string;
  heightMeters?: string;
  distanceToBoundaryMeters?: string;
  withinDetailedPlan?: string;
  propertyDesignation?: string;
  rooms?: Room[];
  windowsPerDirection?: Partial<Record<Direction, string>>;
  mainEntranceDirection?: string;
  // Whether a kontrollansvarig is likely required for this case - a
  // determination Eivor makes from regelverk, never a person it assigns.
  // "Ja"/"Nej"/"Osäkert", same convention as withinDetailedPlan.
  requiresKontrollansvarig?: string;
  kontrollansvarigNamn?: string;
  kontrollansvarigKontakt?: string;
};

const SCALAR_FIELDS = [
  "projectType",
  "description",
  "widthMeters",
  "depthMeters",
  "areaSqm",
  "heightMeters",
  "distanceToBoundaryMeters",
  "withinDetailedPlan",
  "propertyDesignation",
  "mainEntranceDirection",
  "requiresKontrollansvarig",
  "kontrollansvarigNamn",
  "kontrollansvarigKontakt",
] as const satisfies readonly (keyof InterviewAnswers)[];

// Risk-inventory items #2/#5/#6: these three fields are only ever
// supposed to hold one of a fixed, known set of values ("exakt ett av
// ..." per the prompt), but nothing enforced that - any non-empty string
// passed straight through. A drifted value (wrong casing, a stray
// synonym, a leftover "Osäkert" from an earlier prompt revision) would
// silently fail every downstream exact-match check - e.g. the
// kontrollansvarig warning card only renders on `=== "Ja"`, so the chat
// text could say "you need a KA" while the saved field just didn't
// register as one. Rejecting (not coercing) an out-of-enum value here
// means it's treated as "not yet answered" - determinePhase() keeps the
// relevant phase active and the model gets asked again, rather than a
// bad value being trusted and persisted.
const ENUM_FIELDS: Partial<Record<(typeof SCALAR_FIELDS)[number], readonly string[]>> = {
  projectType: PROJECT_TYPE_OPTIONS,
  withinDetailedPlan: YES_NO_UNKNOWN_OPTIONS,
  requiresKontrollansvarig: YES_NO_UNKNOWN_OPTIONS,
};

// What embedded widget, if any, the chat should show next - the model
// requests these explicitly instead of trying to describe an upload
// control in plain text.
export type InterviewRequest =
  | `photo:${Direction}`
  | "situationsplan"
  | "detaljplan-status"
  | null;

const PHOTO_REQUESTS = DIRECTIONS.map((d) => `photo:${d}`);

export type ParsedInterviewMessage = {
  text: string;
  answers: InterviewAnswers;
  request: InterviewRequest;
  done: boolean;
  // The model sets this when the user's latest message explicitly asked
  // to skip ahead (e.g. "jag vill ha ritningar nu") rather than continue
  // the current phase's focus question - see checkDrawingReadiness() and
  // its use in the interview route for how this is acted on.
  skipAheadRequested: boolean;
};

const JSON_BLOCK = /```json\s*([\s\S]*?)\s*```/;

function parseRooms(value: unknown): Room[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rooms = value
    .filter(
      (r): r is { type: unknown; percentage: unknown } => typeof r === "object" && r !== null,
    )
    .map((r) => ({
      type: typeof r.type === "string" ? r.type : "",
      percentage: typeof r.percentage === "string" ? r.percentage : String(r.percentage ?? ""),
    }))
    .filter((r) => r.type);
  return rooms.length ? rooms : undefined;
}

// Risk-inventory item #8: a non-numeric window answer (e.g. "några",
// "ett par") used to pass straight through as an opaque string, then
// silently became 0 windows downstream in /api/projekt/ritning
// (parseSwedishNumber(...) || 0) - a wrong fact baked into the generated
// drawing with nothing anywhere signalling it was ever unparseable.
// Rejecting it here instead means it's simply not saved this turn, so
// hasRoomDetails() keeps the rooms phase active and the model is
// naturally prompted to ask again, rather than trusting a bad value.
function parseWindows(value: unknown): Partial<Record<Direction, string>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const result: Partial<Record<Direction, string>> = {};
  for (const direction of DIRECTIONS) {
    const v = (value as Record<string, unknown>)[direction];
    if (typeof v === "number" && Number.isFinite(v)) {
      result[direction] = String(v);
    } else if (typeof v === "string" && v.trim() && Number.isFinite(parseSwedishNumber(v))) {
      result[direction] = v.trim();
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function parseRequest(value: unknown): InterviewRequest {
  if (value === "situationsplan" || value === "detaljplan-status") return value;
  if (typeof value === "string" && PHOTO_REQUESTS.includes(value)) {
    return value as InterviewRequest;
  }
  return null;
}

// Mirrors parseAssistantMessage in lib/verdict.ts, but for the interview's
// richer {"answers": {...}, "request": ..., "done": bool} block.
export function parseInterviewMessage(raw: string): ParsedInterviewMessage {
  const match = raw.match(JSON_BLOCK);
  if (!match) {
    return { text: raw.trim(), answers: {}, request: null, done: false, skipAheadRequested: false };
  }

  try {
    const parsed = JSON.parse(match[1]);
    const answers: InterviewAnswers = {};
    const rawAnswers = (parsed?.answers ?? {}) as Record<string, unknown>;

    for (const field of SCALAR_FIELDS) {
      const value = rawAnswers[field];
      if (typeof value === "string" && value.trim()) {
        const trimmed = value.trim();
        const allowedValues = ENUM_FIELDS[field];
        if (allowedValues && !allowedValues.includes(trimmed)) {
          continue; // out-of-enum value - drop it, don't trust it verbatim
        }
        answers[field] = trimmed;
      }
    }
    const rooms = parseRooms(rawAnswers.rooms);
    if (rooms) answers.rooms = rooms;
    const windows = parseWindows(rawAnswers.windowsPerDirection);
    if (windows) answers.windowsPerDirection = windows;

    return {
      text: raw.slice(0, match.index).trim(),
      answers,
      request: parseRequest(parsed?.request),
      done: Boolean(parsed?.done),
      skipAheadRequested: Boolean(parsed?.skipAheadRequested),
    };
  } catch {
    return { text: raw.trim(), answers: {}, request: null, done: false, skipAheadRequested: false };
  }
}

// New non-empty values win; a field/list the model didn't mention this
// turn keeps whatever was already known, so nothing is ever silently
// erased by an incomplete extraction.
export function mergeAnswers(
  existing: Record<string, unknown>,
  update: InterviewAnswers,
): Record<string, unknown> {
  const merged = { ...existing };

  for (const field of SCALAR_FIELDS) {
    const value = update[field];
    if (typeof value === "string" && value.trim()) {
      merged[field] = value;
    }
  }
  if (update.rooms?.length) {
    merged.rooms = update.rooms;
  }
  if (update.windowsPerDirection) {
    merged.windowsPerDirection = {
      ...(merged.windowsPerDirection as Partial<Record<Direction, string>> | undefined),
      ...update.windowsPerDirection,
    };
  }

  return merged;
}

// Human-readable diff for the small inline "Sparat: ..." confirmation
// shown after each turn, so the user sees something was registered
// without it feeling like a form.
//
// #1(b): since the model is no longer asked to restate every known
// field every turn (#1c - only new/changed values are sent), any value
// that DOES change now genuinely means something happened - either a
// deliberate correction, or a drifted/hallucinated overwrite. Either
// way it should be visible, not silently folded into the same "Sparat:"
// wording as a first-time fill. An overwrite of an existing value shows
// as "label gammalt → nytt" instead of just "label nytt", so a
// correction is auditable in the same place the user already looks for
// confirmation, and an unwanted drift is just as visible as a wanted one.
export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string | null {
  const labels: Record<string, string> = {
    projectType: "typ av åtgärd",
    widthMeters: "bredd",
    depthMeters: "djup",
    areaSqm: "yta",
    heightMeters: "höjd till nock",
    distanceToBoundaryMeters: "avstånd till tomtgräns",
    withinDetailedPlan: "detaljplan",
    propertyDesignation: "fastighetsbeteckning",
    mainEntranceDirection: "huvudentré",
    requiresKontrollansvarig: "kontrollansvarig-bedömning",
    kontrollansvarigNamn: "kontrollansvarigs namn",
    kontrollansvarigKontakt: "kontrollansvarigs kontaktuppgifter",
  };

  const parts: string[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const beforeValue = before[field];
    const afterValue = after[field];
    if (afterValue && afterValue !== beforeValue) {
      parts.push(beforeValue ? `${label} ${beforeValue} → ${afterValue}` : `${label} ${afterValue}`);
    }
  }
  if (
    Array.isArray(after.rooms) &&
    JSON.stringify(after.rooms) !== JSON.stringify(before.rooms)
  ) {
    parts.push(Array.isArray(before.rooms) && before.rooms.length ? "rumsindelning (ändrad)" : "rumsindelning");
  }
  if (
    after.windowsPerDirection &&
    JSON.stringify(after.windowsPerDirection) !== JSON.stringify(before.windowsPerDirection)
  ) {
    parts.push(before.windowsPerDirection ? "fönster (ändrade)" : "fönster");
  }

  return parts.length ? `Sparat: ${parts.join(", ")}` : null;
}

// The interview system prompt used to present all ~9 steps in full detail
// on every single turn, leaving it up to the model to infer which one was
// actually still relevant from a static list plus the "already known"
// JSON blob. This determines that server-side instead, deterministically,
// from data already persisted - so the prompt can show just one focused
// instruction block per turn instead of the whole list every time.
export type InterviewPhase =
  | "projectType"
  | "matt"
  | "boundary"
  | "detaljplan"
  | "kontrollansvarig"
  | "rooms"
  | "photos"
  | "wrapup";

const ROOM_REQUIRING_TYPES = new Set(["Tillbyggnad", "Nybyggnad", "Attefallshus"]);

export function needsRooms(projectType: unknown): boolean {
  return typeof projectType === "string" && ROOM_REQUIRING_TYPES.has(projectType);
}

function hasRoomDetails(answers: Record<string, unknown>): boolean {
  return (
    Array.isArray(answers.rooms) &&
    answers.rooms.length > 0 &&
    Boolean(answers.mainEntranceDirection) &&
    Boolean(answers.windowsPerDirection)
  );
}

export function determinePhase(
  answers: Record<string, unknown>,
  uploadedPhotos: Partial<Record<Direction, boolean>>,
): InterviewPhase {
  if (!answers.projectType) return "projectType";
  if (!answers.widthMeters || !answers.depthMeters || !answers.areaSqm || !answers.heightMeters) {
    return "matt";
  }
  if (!answers.distanceToBoundaryMeters) return "boundary";
  if (!answers.withinDetailedPlan) return "detaljplan";
  if (!answers.requiresKontrollansvarig) return "kontrollansvarig";
  if (needsRooms(answers.projectType) && !hasRoomDetails(answers)) return "rooms";
  if (DIRECTIONS.some((d) => !uploadedPhotos[d])) return "photos";
  return "wrapup";
}

// The UI's progress counter used to count a fixed list of 6 scalar
// fields, hardcoded separately from determinePhase() - which meant it
// never accounted for rooms or photos at all. Live-observed effect: it
// reached "6 av 6" as soon as withinDetailedPlan was answered (around
// turn 5) and then sat frozen there through rooms and all four photo
// uploads, well before the interview was actually done. This derives
// progress from the same phase order determinePhase() already uses, so
// the two can never drift apart.
const PHASE_ORDER: readonly InterviewPhase[] = [
  "projectType",
  "matt",
  "boundary",
  "detaljplan",
  "kontrollansvarig",
  "rooms",
  "photos",
  "wrapup",
];

export function phaseProgress(
  answers: Record<string, unknown>,
  uploadedPhotos: Partial<Record<Direction, boolean>>,
): { completed: number; total: number } {
  const applicable = PHASE_ORDER.filter(
    (phase) => phase !== "wrapup" && (phase !== "rooms" || needsRooms(answers.projectType)),
  );
  const phase = determinePhase(answers, uploadedPhotos);
  const completed = phase === "wrapup" ? applicable.length : applicable.indexOf(phase);
  return { completed, total: applicable.length };
}

// Live-observed failure mode (real Anthropic call, not hypothetical):
// the model set request:"photo:norr" while it was still in the
// detaljplan phase, with reply text that never actually asked for a
// photo - so the upload widget would pop into the chat unprompted, a
// phase early. Same class of bug as "done" firing early: the model
// doesn't reliably respect the phase it was just told to focus on, so
// the fix is the same - a deterministic gate keyed off determinePhase(),
// not tighter prompt wording.
export function gateRequest(
  phase: InterviewPhase,
  request: InterviewRequest,
  uploadedPhotos: Partial<Record<Direction, boolean>>,
): InterviewRequest {
  if (request === "detaljplan-status") {
    return phase === "detaljplan" ? request : null;
  }
  if (request === "situationsplan") {
    return phase === "wrapup" ? request : null;
  }
  if (request?.startsWith("photo:")) {
    const direction = request.slice("photo:".length) as Direction;
    return phase === "photos" && !uploadedPhotos[direction] ? request : null;
  }
  return null;
}

// The hard minimum /api/projekt/ritning itself requires before it will
// generate anything (width/depth for the volume plan and floor plan,
// height for the elevations and section) - shared so "is there enough to
// skip ahead to drawings" (interview route) and "can ritning actually run"
// (ritning route) can never drift out of sync with each other.
const DRAWING_REQUIRED_FIELDS: { field: keyof InterviewAnswers; label: string }[] = [
  { field: "widthMeters", label: "bredd" },
  { field: "depthMeters", label: "djup" },
  { field: "heightMeters", label: "höjd till nock" },
];

export function checkDrawingReadiness(
  answers: Record<string, unknown>,
): { ready: boolean; missing: string[] } {
  // Same truthy-after-parsing check /api/projekt/ritning itself uses (a
  // Swedish comma-decimal string must parse, and "0" is exactly as
  // unusable as blank) - not a plain truthy-string check, so this stays
  // exactly in sync with what ritning will actually accept.
  const missing = DRAWING_REQUIRED_FIELDS.filter(
    ({ field }) => !parseSwedishNumber(answers[field]),
  ).map(({ label }) => label);
  return { ready: missing.length === 0, missing };
}

// Risk-inventory item #4: "done" used to only check the phase AFTER this
// turn's merge, which let the model declare done on the very first turn
// wrapup instructions were shown - before the user had any chance to
// respond to either of wrapup's two questions (live-observed: behavior
// varied run to run in testing). Requiring wrapup on BOTH sides of the
// turn guarantees at least one full round trip (model asks in wrapup ->
// user responds -> model may then finish) happened first.
export function wrapupRoundTripComplete(
  phaseBeforeTurn: InterviewPhase,
  phaseAfterTurn: InterviewPhase,
): boolean {
  return phaseBeforeTurn === "wrapup" && phaseAfterTurn === "wrapup";
}

// Risk-inventory item #7: the prompt asks room percentages to "summera
// till ca 100%" but nothing checked that - a set that summed to 60% or
// 150% would render a visibly broken floor plan with no signal anything
// was wrong. "ca" gets a real tolerance band (rooms are estimates), not
// exact-100 pedantry.
const ROOM_PERCENTAGE_TOLERANCE = 10;

export function validateRoomPercentages(rooms: Room[]): { valid: boolean; sum: number } {
  const sum = rooms.reduce((total, room) => total + (parseSwedishNumber(room.percentage) || 0), 0);
  return { valid: Math.abs(sum - 100) <= ROOM_PERCENTAGE_TOLERANCE, sum };
}

// Risk-inventory item #3: the kontrollansvarig determination must be
// grounded in retrieved regelverk (never general knowledge) and, when
// the answer is "Ja", must carry a fixed disclaimer that Eivor never
// acts as, recommends, or substitutes for a real kontrollansvarig - both
// were previously just prompt instructions with nothing checking either
// one actually happened.
export const KONTROLLANSVARIG_DISCLAIMER =
  "Det här är bara information och en påminnelse – jag agerar aldrig som, föreslår aldrig en specifik person, och ersätter aldrig en kontrollansvarig.";

export const KONTROLLANSVARIG_NO_GROUNDING_NOTE =
  "Jag kunde tyvärr inte hitta tillräckligt underlag i regelverket för att bedöma om det här kräver en kontrollansvarig just nu - dubbelkolla gärna med kommunens bygglovsenhet eller en kontrollansvarig direkt.";

export function enforceKontrollansvarigDisclosure(params: {
  phase: InterviewPhase;
  hasGroundingContext: boolean;
  text: string;
  answers: InterviewAnswers;
}): { text: string; answers: InterviewAnswers } {
  if (params.phase !== "kontrollansvarig") {
    return { text: params.text, answers: params.answers };
  }

  if (!params.hasGroundingContext) {
    // No retrieved regelverk to ground a Ja/Nej determination in - never
    // trust an ungrounded answer here, override to the honest "don't
    // know" rather than risk a confident-but-baseless legal claim.
    return {
      text: params.text.includes(KONTROLLANSVARIG_NO_GROUNDING_NOTE)
        ? params.text
        : `${params.text}\n\n${KONTROLLANSVARIG_NO_GROUNDING_NOTE}`,
      answers: { ...params.answers, requiresKontrollansvarig: "Vet inte" },
    };
  }

  if (
    params.answers.requiresKontrollansvarig === "Ja" &&
    !params.text.includes(KONTROLLANSVARIG_DISCLAIMER)
  ) {
    return {
      text: `${params.text}\n\n${KONTROLLANSVARIG_DISCLAIMER}`,
      answers: params.answers,
    };
  }

  return { text: params.text, answers: params.answers };
}

// Risk-inventory item #9: skipAheadRequested is a brand-new self-report
// with the exact same shape as the original unguarded "done" - nothing
// checked it either direction. Two independent, deliberately different-
// strength checks against the user's own latest message:
//  - a claimed true is only honored if the message contains at least
//    some skip-ahead-shaped language, so a hallucinated flag with zero
//    textual basis can't end the interview early on its own.
//  - a claimed false is overridden only by a much narrower, higher-
//    precision phrase match, so a genuine request the model failed to
//    flag isn't silently dropped. This is a heuristic, not a semantic
//    understanding of the message - "jag vill veta mer om ritningar"
//    could in principle false-trigger the override, but a false positive
//    here only shows the review screen a turn early (fully recoverable),
//    which is a better failure mode than silently ignoring a real ask.
const SKIP_AHEAD_KEYWORD = /ritning|hoppa|skippa|generera/i;
const SKIP_AHEAD_STRONG_PHRASE =
  /(vill ha|kan vi|kan du).{0,20}(ritning|generera)|(ritning\w*|generera\w*).{0,10}\bnu\b|hoppa (till|över)|skippa/i;

export function resolveSkipAheadRequested(modelClaimed: boolean, latestUserMessage: string): boolean {
  if (modelClaimed) return SKIP_AHEAD_KEYWORD.test(latestUserMessage);
  return SKIP_AHEAD_STRONG_PHRASE.test(latestUserMessage);
}

// Risk-inventory item #10: the "never re-ask a known field" instruction
// was only structurally protected for fields with their own dedicated
// phase (once satisfied, determinePhase() never shows that phase's
// instruction again). The two "frivilligt" wrapup items have no such
// phase of their own - wrapup can span several turns while situationsplan
// is being resolved, and the model could re-ask about
// fastighetsbeteckning on every one of them. This checks the actual
// conversation history (already available, no new state) rather than
// trusting the model's memory of what it already asked.
export function wasAlreadyAskedAbout(
  messages: { role: "user" | "assistant"; content: string }[],
  keywords: readonly string[],
): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      keywords.some((k) => m.content.toLowerCase().includes(k.toLowerCase())),
  );
}

// Risk-inventory item #11: gateRequest() stops an inappropriate request
// *value* from surviving (e.g. a photo request during the wrong phase),
// but didn't check that the reply *text* actually matches whatever
// request value does pass through - the original live-observed bug was
// exactly this: request:"photo:norr" with reply text that never
// mentioned a photo at all. A mismatch here drops the request rather
// than inventing text to justify it - the field just stays open and the
// phase naturally re-prompts next turn if still needed.
const REQUEST_TEXT_KEYWORDS: Partial<Record<string, readonly string[]>> = {
  situationsplan: ["situationsplan", "nybyggnadskarta", "karta"],
  "detaljplan-status": ["detaljplan"],
};

export function textMatchesRequest(text: string, request: InterviewRequest): boolean {
  if (!request) return true;
  const lower = text.toLowerCase();
  if (request.startsWith("photo:")) {
    return /foto|bild|fasad/i.test(lower);
  }
  const keywords = REQUEST_TEXT_KEYWORDS[request] ?? [];
  return keywords.some((k) => lower.includes(k));
}

// Risk-inventory item #12: done and request were gated independently of
// each other, so both could legitimately survive their own gates at once
// (e.g. wrapup: done:true alongside request:"situationsplan") - not
// destructive, but an incoherent combined UI state (a review screen and
// an upload widget appearing together). done wins: once the interview is
// done, remaining optional items are handled via the document panel/
// review screen, not an extra widget bolted onto the same turn.
export function resolveDoneAndRequest(
  done: boolean,
  request: InterviewRequest,
): { done: boolean; request: InterviewRequest } {
  return { done, request: done ? null : request };
}

// Risk-inventory item #13: the "kort, 1-2 frågor per svar" tone
// instruction has no reliable deterministic check - counting "?"
// characters or detecting non-Swedish text both have high false-
// positive/negative rates that would make the flag itself untrustworthy,
// and neither is fixed without a second model call or a new dependency.
// Response length is the one piece of this that's cheaply and honestly
// checkable, so that's the only sub-check implemented; the rest is
// accepted as a known cosmetic risk (see the interview route's use of
// this for the console.warn side - deliberately a log line, not a
// content-mutating gate, since truncating text risks cutting off
// legally-relevant information mid-sentence).
const UNUSUALLY_LONG_RESPONSE_CHARS = 600;

export function isUnusuallyLong(text: string): boolean {
  return text.length > UNUSUALLY_LONG_RESPONSE_CHARS;
}

// Live-observed bug: the "avsluta med ett kodblock" instruction implies
// natural-language text comes BEFORE the JSON block, but the model
// occasionally violates that ordering (or omits leading text entirely) -
// parseInterviewMessage() then extracts an empty `text`, since
// everything before the JSON block's match index is blank. Most turns
// this is barely noticeable (a blank chat bubble mid-conversation), but
// on the turn where done becomes true it's the single most visible
// moment in the whole flow - the user would see nothing at all right
// when the interview finishes. This is the same failure mode as the
// original bare "done" self-report: a formatting instruction with
// nothing checking it was followed. Deterministic fallback rather than
// trusting the model to always produce closing prose.
export const EMPTY_DONE_FALLBACK_MESSAGE = "Klart! Här är din sammanställning.";

export function ensureDoneMessage(text: string, done: boolean): string {
  return done && !text.trim() ? EMPTY_DONE_FALLBACK_MESSAGE : text;
}
