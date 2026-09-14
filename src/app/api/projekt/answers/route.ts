import { createClient } from "@/lib/supabase/server";
import { mergeAnswers, type InterviewAnswers } from "@/lib/interview";
import { DIRECTIONS, type Direction } from "@/lib/project-fields";

// Structured fields the document panel lets a user edit directly instead
// of going back through the chat. Deliberately the same fields listed in
// the feature request - projectType and other chat-collected fields stay
// chat-only for now.
const EDITABLE_TEXT_FIELDS = [
  "widthMeters",
  "depthMeters",
  "heightMeters",
  "distanceToBoundaryMeters",
  "withinDetailedPlan",
] as const;

function sanitizeUpdate(raw: Record<string, unknown>): InterviewAnswers {
  const update: InterviewAnswers = {};

  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = raw[field];
    if (typeof value === "string" && value.trim()) update[field] = value.trim();
  }

  if (Array.isArray(raw.rooms)) {
    const rooms = raw.rooms
      .filter((room): room is { type: unknown; percentage: unknown } => typeof room === "object" && room !== null)
      .map((room) => ({
        type: typeof room.type === "string" ? room.type.trim() : "",
        percentage: typeof room.percentage === "string" ? room.percentage.trim() : "",
      }))
      .filter((room) => room.type);
    if (rooms.length) update.rooms = rooms;
  }

  if (typeof raw.windowsPerDirection === "object" && raw.windowsPerDirection !== null) {
    const windows: Partial<Record<Direction, string>> = {};
    for (const direction of DIRECTIONS) {
      const value = (raw.windowsPerDirection as Record<string, unknown>)[direction];
      if (typeof value === "string" && value.trim()) windows[direction] = value.trim();
    }
    if (Object.keys(windows).length) update.windowsPerDirection = windows;
  }

  return update;
}

// The panel writes to the exact same project_answers row the chat writes
// to, via the same mergeAnswers() merge semantics (new non-empty values
// win, nothing already known is silently erased) - a panel edit and a
// chat answer are just two different ways of producing the same update.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
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

  const rawAnswers = (body as { answers?: unknown })?.answers;
  if (typeof rawAnswers !== "object" || rawAnswers === null) {
    return Response.json({ error: "Inget att spara." }, { status: 400 });
  }
  const update = sanitizeUpdate(rawAnswers as Record<string, unknown>);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Inget giltigt fält att spara." }, { status: 400 });
  }

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
  const existing = (answerRow?.answers ?? {}) as Record<string, unknown>;
  const merged = mergeAnswers(existing, update);

  const { error: upsertError } = await supabase
    .from("project_answers")
    .upsert({ project_id: projectId, answers: merged }, { onConflict: "project_id" });
  if (upsertError) {
    return Response.json({ error: "Kunde inte spara." }, { status: 500 });
  }

  return Response.json({ answers: merged });
}
