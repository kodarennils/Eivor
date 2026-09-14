// NL-2: standalone endpoint for the natural-language drawing-edit
// surface (NL-4, not yet built) - deliberately separate from
// /api/projekt/interview per the explicit decision to keep the interview
// chat and drawing-edit input as fully separate surfaces, no per-message
// routing between two endpoints. Takes the client's current in-session
// DrawingModel (see page.tsx's editedDrawingModel - nothing is persisted
// server-side yet, same as the rest of Phase D) plus an instruction, and
// returns a structured edit for NL-3 to apply - it never touches the
// database and doesn't need a project's stored answers, only auth.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  buildRitEditSystemPrompt,
  parseRitEditResponse,
  isValidDrawingModel,
  MAX_RIT_EDIT_HISTORY,
} from "@/lib/rit-edit";

const MODEL = "claude-sonnet-5";
const MAX_INSTRUCTION_LENGTH = 300;
const MAX_HISTORY_MESSAGE_LENGTH = 1000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function isValidHistoryMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= MAX_HISTORY_MESSAGE_LENGTH
  );
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  const model = (body as { model?: unknown })?.model;
  if (!isValidDrawingModel(model)) {
    return Response.json({ error: "Ogiltig ritningsdata." }, { status: 400 });
  }

  const instruction = (body as { instruction?: unknown })?.instruction;
  if (
    typeof instruction !== "string" ||
    !instruction.trim() ||
    instruction.length > MAX_INSTRUCTION_LENGTH
  ) {
    return Response.json({ error: "Ogiltig instruktion." }, { status: 400 });
  }

  // A too-long history is trimmed to its most recent turns, not rejected
  // outright - unlike the interview's `messages` (the entire required
  // conversation, so an oversized one there is a hard 400), `history`
  // here is supplementary context for a clarification round-trip. Wiping
  // it all on overflow would lose exactly the context that mattered most
  // (a long back-and-forth), right when it's most needed.
  const historyRaw = (body as { history?: unknown })?.history;
  const history: ChatMessage[] = (
    Array.isArray(historyRaw) && historyRaw.every(isValidHistoryMessage) ? (historyRaw as ChatMessage[]) : []
  ).slice(-MAX_RIT_EDIT_HISTORY);

  const systemPrompt = buildRitEditSystemPrompt(model);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...history, { role: "user", content: instruction }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const result = parseRitEditResponse(text, model);
    // `raw` (the full fenced-JSON text, not just the parsed result) is
    // what the client should push into `history` for the NEXT call -
    // live-verified during NL-2 that resuming a clarification round-trip
    // needs the model's own exact prior turn in the conversation, not
    // just its friendly message. Can be empty (the same rare
    // empty-response case interview.ts's ensureDoneMessage guards
    // against elsewhere) - the client falls back to `message` in that
    // case rather than pushing an empty assistant turn (which the
    // Messages API's role-alternation requirement wouldn't accept next
    // to another user turn anyway).
    return Response.json({ ...result, raw: text });
  } catch (error) {
    console.error("Anthropic API error (rit-edit):", error);
    return Response.json(
      { error: "Kunde inte tolka ändringen just nu. Försök igen om en liten stund." },
      { status: 502 },
    );
  }
}
