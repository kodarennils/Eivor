import { DIRECTIONS, type Direction, type Room } from "@/lib/project-fields";

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
] as const satisfies readonly (keyof InterviewAnswers)[];

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

function parseWindows(value: unknown): Partial<Record<Direction, string>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const result: Partial<Record<Direction, string>> = {};
  for (const direction of DIRECTIONS) {
    const v = (value as Record<string, unknown>)[direction];
    if (typeof v === "string" && v.trim()) result[direction] = v.trim();
    else if (typeof v === "number") result[direction] = String(v);
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
  if (!match) return { text: raw.trim(), answers: {}, request: null, done: false };

  try {
    const parsed = JSON.parse(match[1]);
    const answers: InterviewAnswers = {};
    const rawAnswers = (parsed?.answers ?? {}) as Record<string, unknown>;

    for (const field of SCALAR_FIELDS) {
      const value = rawAnswers[field];
      if (typeof value === "string" && value.trim()) {
        answers[field] = value.trim();
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
    };
  } catch {
    return { text: raw.trim(), answers: {}, request: null, done: false };
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
  };

  const parts: string[] = [];
  for (const [field, label] of Object.entries(labels)) {
    if (after[field] && after[field] !== before[field]) {
      parts.push(`${label} ${after[field]}`);
    }
  }
  if (
    Array.isArray(after.rooms) &&
    JSON.stringify(after.rooms) !== JSON.stringify(before.rooms)
  ) {
    parts.push("rumsindelning");
  }
  if (
    after.windowsPerDirection &&
    JSON.stringify(after.windowsPerDirection) !== JSON.stringify(before.windowsPerDirection)
  ) {
    parts.push("fönster");
  }

  return parts.length ? `Sparat: ${parts.join(", ")}` : null;
}
