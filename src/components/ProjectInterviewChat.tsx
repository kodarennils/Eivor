"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, BuildingIcon, PaperclipIcon } from "@/components/icons";
import { ImageUploadSlot } from "@/components/ImageUploadSlot";
import { SituationsplanUpload } from "@/components/SituationsplanUpload";
import { DetaljplanUpload } from "@/components/DetaljplanUpload";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@/lib/project-fields";
import { describeChanges, phaseProgress, type InterviewRequest } from "@/lib/interview";
import { buildTekniskBeskrivning } from "@/lib/teknisk-beskrivning";
import type { KontrollplanPunkt } from "@/app/api/projekt/kontrollplan/route";
import type { GeneratedDrawings } from "@/lib/generated-drawings";
import { ReviewScreen } from "@/components/ReviewScreen";

type ApiMessage = { role: "user" | "assistant"; content: string };

// One JSON object per line (NDJSON) from /api/projekt/interview's
// streaming response - see that route for the server side. "delta"
// events arrive many times per reply as the model's own prose streams
// in; exactly one terminal "final" (or "error") event closes out the
// turn. Never trusted at face value - same discipline as isValidMessage
// elsewhere in this codebase - a line that doesn't match one of these
// shapes is dropped rather than acted on.
type StreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "final";
      message: string;
      answers: Record<string, unknown>;
      request: InterviewRequest;
      done: boolean;
    }
  | { type: "error"; error: string };

function parseStreamEvent(raw: unknown): StreamEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type === "delta" && typeof obj.text === "string") {
    return { type: "delta", text: obj.text };
  }
  if (
    obj.type === "final" &&
    typeof obj.message === "string" &&
    typeof obj.answers === "object" &&
    obj.answers !== null &&
    typeof obj.done === "boolean"
  ) {
    return {
      type: "final",
      message: obj.message,
      answers: obj.answers as Record<string, unknown>,
      request: (obj.request ?? null) as InterviewRequest,
      done: obj.done,
    };
  }
  if (obj.type === "error" && typeof obj.error === "string") {
    return { type: "error", error: obj.error };
  }
  return null;
}

const DETALJPLAN_ANSWER_TEXT: Record<"Ja" | "Nej" | "Vet inte", string> = {
  Ja: "Ja, fastigheten omfattas av detaljplan.",
  Nej: "Nej, den ligger utanför detaljplan.",
  "Vet inte": "Jag vet inte.",
};

// The chat is pure conversation now - no drawing (SVG or Konva) ever
// renders inline here. "Generera ritningar" is still triggered from the
// chat (it's the natural last step of the conversational review), but
// its RESULT is bubbled up via onDrawingsGenerated and rendered in the
// document panel's "Ritningar" section instead of a chat timeline item.
type TimelineItem =
  | { kind: "message"; role: "user" | "assistant"; content: string }
  | { kind: "confirmation"; text: string }
  | { kind: "photo"; id: string; direction: Direction; uploaded: boolean }
  | { kind: "situationsplan"; id: string; saved: boolean; skipped: boolean }
  | { kind: "detaljplan-status"; id: string; resolvedLabel: string | null }
  | { kind: "generate-cta" };

export function ProjectInterviewChat({
  userId,
  projectId,
  answers = {},
  photos = {},
  isEmptyState = false,
  onAnswersChange,
  onDrawingsGenerated,
  onPhotoUploaded: onPhotoUploadedProp,
  onSituationsplanSaved: onSituationsplanSavedProp,
  onDetaljplanUploaded: onDetaljplanUploadedProp,
}: {
  userId: string;
  projectId: string;
  answers: Record<string, unknown>;
  photos?: Partial<Record<Direction, string>>;
  // True while the project has zero collected data (page.tsx's
  // showOverviewPanel is false, see lib/overview-sections.ts) - swaps
  // this component's own layout to a centered "starting point" screen
  // instead of the narrow header+scroll+input column used once the
  // overview panel exists alongside it. Purely a container/layout
  // change - message bubble styling, colors, and the input's functional
  // behavior are identical in both branches below.
  isEmptyState?: boolean;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onDrawingsGenerated?: (drawings: GeneratedDrawings) => void;
  onPhotoUploaded?: (direction: Direction) => void;
  onSituationsplanSaved?: () => void;
  onDetaljplanUploaded?: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // isLoading covers the whole request (keeps the input disabled);
  // isStreaming is only true once the first real text delta has
  // arrived, so "Eivor tänker…" can hand off to the actual growing
  // message bubble instead of sitting alongside it.
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDrawings, setIsGeneratingDrawings] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  // Replaces the old "does the timeline already contain a drawings item"
  // check, now that drawings never enter the timeline at all.
  const [hasGeneratedDrawings, setHasGeneratedDrawings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const apiMessagesRef = useRef<ApiMessage[]>([]);
  const answersRef = useRef<Record<string, unknown>>({});

  const uploadedPhotos = Object.fromEntries(
    DIRECTIONS.map((d) => [d, Boolean(photos[d])]),
  ) as Partial<Record<Direction, boolean>>;
  const { completed: completion, total: progressTotal } = phaseProgress(answers, uploadedPhotos);
  // Only the most recent message keeps full color - everything earlier
  // reads as gray "history" so the active exchange stands out.
  const lastMessageIndex = timeline.reduce(
    (last, item, i) => (item.kind === "message" ? i : last),
    -1,
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline, isLoading]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(nextApiMessages: ApiMessage[]) {
    setError(null);
    setIsLoading(true);
    setIsStreaming(false);
    apiMessagesRef.current = nextApiMessages;

    try {
      const res = await fetch("/api/projekt/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, messages: nextApiMessages }),
      });

      if (!res.ok || !res.body) {
        let errorMessage = "Något gick fel.";
        try {
          const errorBody = await res.json();
          errorMessage = errorBody?.error ?? errorMessage;
        } catch {
          // Non-JSON error body (e.g. a proxy/edge failure before the
          // route even ran) - fall back to the generic message above
          // rather than surface a parse error instead of the real one.
        }
        setError(errorMessage);
        return;
      }

      // Reads the NDJSON stream (see the interview route) and renders
      // "delta" text progressively - the assistant's timeline bubble is
      // pushed lazily on the FIRST delta (not upfront empty), so there's
      // no flash of an empty bubble sitting next to "Eivor tänker…".
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      let hasPushedMessage = false;
      let finalEvent: Extract<StreamEvent, { type: "final" }> | null = null;
      let streamErrorMessage: string | null = null;

      readLoop: while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          if (!line.trim()) continue;

          let rawEvent: unknown;
          try {
            rawEvent = JSON.parse(line);
          } catch {
            continue; // malformed line - skip rather than crash the reader
          }
          const event = parseStreamEvent(rawEvent);
          if (!event) continue;

          if (event.type === "delta") {
            streamedText += event.text;
            setIsStreaming(true);
            if (!hasPushedMessage) {
              hasPushedMessage = true;
              setTimeline((prev) => [
                ...prev,
                { kind: "message", role: "assistant", content: streamedText },
              ]);
            } else {
              const textForThisUpdate = streamedText;
              setTimeline((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.kind === "message" && last.role === "assistant") {
                  next[next.length - 1] = { ...last, content: textForThisUpdate };
                }
                return next;
              });
            }
          } else if (event.type === "final") {
            finalEvent = event;
          } else {
            streamErrorMessage = event.error;
            break readLoop;
          }
        }
      }

      if (streamErrorMessage) {
        setError(streamErrorMessage);
        return;
      }
      if (!finalEvent) {
        setError("Kunde inte tolka svaret från servern.");
        return;
      }
      const data = finalEvent;

      apiMessagesRef.current = [
        ...nextApiMessages,
        { role: "assistant", content: data.message },
      ];

      const changeNote = describeChanges(answersRef.current, data.answers ?? {});
      answersRef.current = data.answers ?? {};
      onAnswersChange?.(answersRef.current);

      setTimeline((prev) => {
        const next: TimelineItem[] = [...prev];
        // The final event's message is authoritative - it can carry a
        // kontrollansvarig-disclaimer/room-percentage append, or the
        // empty-reply fallback, none of which streamed as deltas.
        // Overwrite whatever accumulated from deltas rather than trust
        // it blindly, same "never trust the raw stream, validate before
        // use" discipline as everywhere else in this pipeline.
        if (hasPushedMessage) {
          const last = next[next.length - 1];
          if (last?.kind === "message" && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: data.message };
          } else {
            next.push({ kind: "message", role: "assistant", content: data.message });
          }
        } else {
          next.push({ kind: "message", role: "assistant", content: data.message });
        }
        if (changeNote) next.push({ kind: "confirmation", text: changeNote });
        appendRequestWidget(next, data.request);
        if (data.done && !hasGenerateStep(next) && !hasGeneratedDrawings) {
          next.push({ kind: "generate-cta" });
        }
        return next;
      });
    } catch {
      setError("Kunde inte nå servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }

  function appendRequestWidget(next: TimelineItem[], request: InterviewRequest) {
    if (!request) return;
    const id = `${request}-${next.length}`;
    if (request === "situationsplan") {
      next.push({ kind: "situationsplan", id, saved: false, skipped: false });
    } else if (request === "detaljplan-status") {
      next.push({ kind: "detaljplan-status", id, resolvedLabel: null });
    } else {
      const direction = request.slice("photo:".length) as Direction;
      next.push({ kind: "photo", id, direction, uploaded: false });
    }
  }

  function hasGenerateStep(items: TimelineItem[]) {
    return items.some((item) => item.kind === "generate-cta");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setTimeline((prev) => [...prev, { kind: "message", role: "user", content: trimmed }]);
    setInput("");
    send([...apiMessagesRef.current, { role: "user", content: trimmed }]);
  }

  function handlePhotoUploaded(id: string, direction: Direction) {
    setTimeline((prev) =>
      prev.map((item) => (item.kind === "photo" && item.id === id ? { ...item, uploaded: true } : item)),
    );
    onPhotoUploadedProp?.(direction);
    send([
      ...apiMessagesRef.current,
      {
        role: "user",
        content: `[Jag har nu laddat upp ett foto av fasaden mot ${DIRECTION_LABEL[direction].toLowerCase()}.]`,
      },
    ]);
  }

  function handleDetaljplanStatusAnswer(id: string, answer: "Ja" | "Nej" | "Vet inte") {
    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "detaljplan-status" && item.id === id
          ? { ...item, resolvedLabel: answer }
          : item,
      ),
    );
    const text = DETALJPLAN_ANSWER_TEXT[answer];
    setTimeline((prev) => [...prev, { kind: "message", role: "user", content: text }]);
    send([...apiMessagesRef.current, { role: "user", content: text }]);
  }

  function handleDetaljplanUpload(id: string) {
    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "detaljplan-status" && item.id === id
          ? { ...item, resolvedLabel: "Ja" }
          : item,
      ),
    );
    onDetaljplanUploadedProp?.();
    send([
      ...apiMessagesRef.current,
      {
        role: "user",
        content:
          "[Jag har nu laddat upp detaljplanen, vilket bekräftar att fastigheten omfattas av detaljplan.]",
      },
    ]);
  }

  function handleSituationsplanSaved(id: string) {
    setTimeline((prev) =>
      prev.map((item) => (item.kind === "situationsplan" && item.id === id ? { ...item, saved: true } : item)),
    );
    onSituationsplanSavedProp?.();
    send([
      ...apiMessagesRef.current,
      { role: "user", content: "[Jag har nu laddat upp och kalibrerat situationsplanen.]" },
    ]);
  }

  function handleSkipSituationsplan(id: string) {
    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "situationsplan" && item.id === id ? { ...item, skipped: true } : item,
      ),
    );
    const text = "Jag har ingen nybyggnadskarta att ladda upp.";
    setTimeline((prev) => [...prev, { kind: "message", role: "user", content: text }]);
    send([...apiMessagesRef.current, { role: "user", content: text }]);
  }

  async function handleGenerateDrawings() {
    setIsGeneratingDrawings(true);
    setDrawingError(null);

    try {
      const [ritningRes, kontrollplanRes] = await Promise.all([
        fetch("/api/projekt/ritning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        }),
        fetch("/api/projekt/kontrollplan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        }),
      ]);
      const data = await ritningRes.json();

      if (!ritningRes.ok) {
        setDrawingError(data.error ?? "Något gick fel.");
        return;
      }

      // The kontrollplan is a separate, RAG-grounded call that can fail
      // independently (e.g. no relevant regelverk found) without blocking
      // the drawings themselves - it just shows its own error inline.
      const kontrollplanData = await kontrollplanRes.json();
      const kontrollplan: KontrollplanPunkt[] = kontrollplanRes.ok
        ? (kontrollplanData.punkter ?? [])
        : [];
      const kontrollplanError = kontrollplanRes.ok
        ? null
        : (kontrollplanData.error ?? "Kunde inte ta fram kontrollplan.");

      onDrawingsGenerated?.({
        plan: data.plan,
        elevations: data.elevations,
        section: data.section,
        floorPlan: data.floorPlan,
        situationsplan: data.situationsplan ?? null,
        kontrollplan,
        kontrollplanError,
        tekniskBeskrivning: buildTekniskBeskrivning(answers, data.facadeAttributes ?? {}),
      });
      setHasGeneratedDrawings(true);
      setTimeline((prev) => [
        ...prev,
        {
          kind: "confirmation",
          text: "Ritningar genererade - se Ritningar i översiktspanelen till höger.",
        },
      ]);
    } catch {
      setDrawingError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsGeneratingDrawings(false);
    }
  }

  // Empty pre-data state: greeting, messages so far, and the input all
  // live as one centered block instead of the usual fixed header +
  // scrolling middle + pinned-bottom-input column - a structurally
  // different layout, not just restyled classes on the same tree, so
  // it's kept as its own early return rather than threading conditional
  // classNames through the shared JSX below. TimelineEntry (message
  // bubbles, widgets) is reused completely unchanged; only the
  // surrounding container and the input's own styling differ here.
  if (isEmptyState) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto">
        <div className="flex w-full max-w-[680px] flex-1 flex-col justify-center px-4 pt-[18vh] pb-[10vh]">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-semibold sm:text-4xl">Berätta om ditt projekt</h1>
          </div>

          <div className="flex flex-col gap-5">
            {timeline.map((item, i) => (
              <TimelineEntry
                key={i}
                item={item}
                isLatestMessage={i === lastMessageIndex}
                userId={userId}
                projectId={projectId}
                answers={answers}
                isGeneratingDrawings={isGeneratingDrawings}
                drawingError={drawingError}
                onPhotoUploaded={handlePhotoUploaded}
                onSituationsplanSaved={handleSituationsplanSaved}
                onSkipSituationsplan={handleSkipSituationsplan}
                onDetaljplanStatusAnswer={handleDetaljplanStatusAnswer}
                onDetaljplanUpload={handleDetaljplanUpload}
                onGenerateDrawings={handleGenerateDrawings}
              />
            ))}

            {isLoading && !isStreaming && (
              <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                <span className="grid size-5 place-items-center rounded-sm bg-accent text-accent-foreground">
                  <BuildingIcon className="size-3" />
                </span>
                <span className="font-normal text-foreground/50">Eivor tänker…</span>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Same functional form as the normal state below (identical
              handlers/state) - just deliberately roomier and rounder so
              it reads as an inviting starting point, not the compact
              pinned-bottom bar it becomes once the conversation is
              underway. */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 flex shrink-0 items-center gap-2 rounded-2xl border border-gray-300 bg-background px-3 py-2 shadow-sm focus-within:border-gray-400"
          >
            <button
              type="button"
              aria-label="Bifoga fil"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/40 hover:text-foreground/70"
            >
              <PaperclipIcon className="h-4.5 w-4.5" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv ett meddelande…"
              disabled={isLoading}
              className="min-w-0 flex-1 bg-transparent px-1 py-3.5 text-base outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Skicka"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
            >
              <ArrowUpIcon className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-1 pb-3 text-sm">
        <span className="font-medium">Bygglovsguiden</span>
        <span className="text-xs text-foreground/50">
          {completion} av {progressTotal} uppgifter
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <div className="flex flex-col gap-5">
          {timeline.map((item, i) => (
            <TimelineEntry
              key={i}
              item={item}
              isLatestMessage={i === lastMessageIndex}
              userId={userId}
              projectId={projectId}
              answers={answers}
              isGeneratingDrawings={isGeneratingDrawings}
              drawingError={drawingError}
              onPhotoUploaded={handlePhotoUploaded}
              onSituationsplanSaved={handleSituationsplanSaved}
              onSkipSituationsplan={handleSkipSituationsplan}
              onDetaljplanStatusAnswer={handleDetaljplanStatusAnswer}
              onDetaljplanUpload={handleDetaljplanUpload}
              onGenerateDrawings={handleGenerateDrawings}
            />
          ))}

          {isLoading && !isStreaming && (
            <div className="flex items-center gap-2 text-xs font-semibold text-accent">
              <span className="grid size-5 place-items-center rounded-sm bg-accent text-accent-foreground">
                <BuildingIcon className="size-3" />
              </span>
              <span className="font-normal text-foreground/50">Eivor tänker…</span>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-2 flex shrink-0 items-center gap-1 rounded-full border border-gray-300 bg-background pr-2 pl-2 focus-within:border-gray-400"
      >
        <button
          type="button"
          aria-label="Bifoga fil"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/40 hover:text-foreground/70"
        >
          <PaperclipIcon className="h-4 w-4" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ett meddelande…"
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Skicka"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function TimelineEntry({
  item,
  isLatestMessage,
  userId,
  projectId,
  answers,
  isGeneratingDrawings,
  drawingError,
  onPhotoUploaded,
  onSituationsplanSaved,
  onSkipSituationsplan,
  onDetaljplanStatusAnswer,
  onDetaljplanUpload,
  onGenerateDrawings,
}: {
  item: TimelineItem;
  isLatestMessage: boolean;
  userId: string;
  projectId: string;
  answers: Record<string, unknown>;
  isGeneratingDrawings: boolean;
  drawingError: string | null;
  onPhotoUploaded: (id: string, direction: Direction) => void;
  onSituationsplanSaved: (id: string) => void;
  onSkipSituationsplan: (id: string) => void;
  onDetaljplanStatusAnswer: (id: string, answer: "Ja" | "Nej" | "Vet inte") => void;
  onDetaljplanUpload: (id: string) => void;
  onGenerateDrawings: () => void;
}) {
  if (item.kind === "message") {
    if (item.role === "assistant") {
      return (
        <div className="max-w-[92%] text-sm leading-6">
          <div
            className={`mb-2 flex items-center gap-2 text-xs font-semibold ${
              isLatestMessage ? "text-accent" : "text-gray-400"
            }`}
          >
            <span
              className={`grid size-5 place-items-center rounded-sm text-accent-foreground ${
                isLatestMessage ? "bg-accent" : "bg-gray-300"
              }`}
            >
              <BuildingIcon className="size-3" />
            </span>
            Eivor
          </div>
          <p className={`whitespace-pre-wrap ${isLatestMessage ? "" : "text-gray-500"}`}>
            {/* trimEnd, not the raw content: live-verified that the
                streaming reply can briefly carry trailing "\n\n" (the
                gap before the ```json block in the model's own raw
                output, only trimmed once the `final` event's validated
                message replaces it) - with whitespace-pre-wrap that
                would flash a blank line at the bottom of the bubble for
                the ~1s the reply is still streaming. Harmless no-op
                once a message is finalized (final.message is already
                trimmed server-side). */}
            {item.content.trimEnd()}
          </p>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <p
          className={`max-w-[84%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
            isLatestMessage
              ? "bg-accent text-accent-foreground"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {item.content}
        </p>
      </div>
    );
  }

  if (item.kind === "confirmation") {
    return <p className="pl-1 text-xs text-foreground/50 italic">✓ {item.text}</p>;
  }

  if (item.kind === "photo") {
    return (
      <div className="max-w-[85%] rounded-xl bg-muted p-3">
        {item.uploaded ? (
          <p className="text-xs text-foreground/50 italic">
            ✓ Fasadfoto mot {DIRECTION_LABEL[item.direction].toLowerCase()} uppladdat
          </p>
        ) : (
          <ImageUploadSlot
            userId={userId}
            projectId={projectId}
            direction={item.direction}
            onUploaded={() => onPhotoUploaded(item.id, item.direction)}
          />
        )}
      </div>
    );
  }

  if (item.kind === "situationsplan") {
    if (item.skipped) {
      return (
        <p className="pl-1 text-xs text-foreground/50 italic">✓ Situationsplan hoppas över</p>
      );
    }
    if (item.saved) {
      return <p className="pl-1 text-xs text-foreground/50 italic">✓ Situationsplan sparad</p>;
    }
    return (
      <div className="max-w-full rounded-xl bg-muted p-3">
        <SituationsplanUpload
          projectId={projectId}
          hasExisting={false}
          onSaved={() => onSituationsplanSaved(item.id)}
        />
        <button
          type="button"
          onClick={() => onSkipSituationsplan(item.id)}
          className="mt-2 text-xs text-foreground/50 hover:text-foreground/80"
        >
          Jag har ingen nybyggnadskarta →
        </button>
      </div>
    );
  }

  if (item.kind === "detaljplan-status") {
    if (item.resolvedLabel) {
      return (
        <p className="pl-1 text-xs text-foreground/50 italic">
          ✓ Detaljplan: {item.resolvedLabel}
        </p>
      );
    }
    return (
      <div className="space-y-3 border-l-2 border-accent pl-4">
        <div className="flex flex-wrap gap-2">
          {(["Ja", "Nej", "Vet inte"] as const).map((answer) => (
            <button
              key={answer}
              type="button"
              onClick={() => onDetaljplanStatusAnswer(item.id, answer)}
              className="rounded-xl border border-border px-3 py-1.5 text-sm hover:border-accent"
            >
              {answer}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-muted p-3">
          <DetaljplanUpload
            projectId={projectId}
            hasExistingUpload={false}
            onUploaded={() => onDetaljplanUpload(item.id)}
          />
        </div>
      </div>
    );
  }

  // "generate-cta" is the only remaining kind - the review screen itself
  // isn't a drawing (it's the review/confirm step before generating), so
  // it stays in chat as the natural last step of the conversation.
  return (
    <ReviewScreen
      answers={answers}
      onGenerate={onGenerateDrawings}
      isGenerating={isGeneratingDrawings}
      error={drawingError}
    />
  );
}
