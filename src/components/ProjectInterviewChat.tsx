"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "@/components/icons";
import { ImageUploadSlot } from "@/components/ImageUploadSlot";
import { SituationsplanUpload } from "@/components/SituationsplanUpload";
import { DetaljplanUpload } from "@/components/DetaljplanUpload";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@/lib/project-fields";
import { describeChanges, type InterviewRequest } from "@/lib/interview";

type ApiMessage = { role: "user" | "assistant"; content: string };

type Drawings = {
  plan: string;
  elevations: Record<Direction, string>;
  section: string;
  floorPlan: string;
  situationsplan: string | null;
};

type TimelineItem =
  | { kind: "message"; role: "user" | "assistant"; content: string }
  | { kind: "confirmation"; text: string }
  | { kind: "photo"; id: string; direction: Direction; uploaded: boolean }
  | { kind: "situationsplan"; id: string; saved: boolean; skipped: boolean }
  | { kind: "detaljplan"; id: string; uploaded: boolean; skipped: boolean }
  | { kind: "generate-cta" }
  | { kind: "drawings"; drawings: Drawings };

export function ProjectInterviewChat({
  userId,
  projectId,
  onAnswersChange,
  onPhotoUploaded: onPhotoUploadedProp,
  onSituationsplanSaved: onSituationsplanSavedProp,
  onDetaljplanUploaded: onDetaljplanUploadedProp,
}: {
  userId: string;
  projectId: string;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onPhotoUploaded?: (direction: Direction) => void;
  onSituationsplanSaved?: () => void;
  onDetaljplanUploaded?: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDrawings, setIsGeneratingDrawings] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const apiMessagesRef = useRef<ApiMessage[]>([]);
  const answersRef = useRef<Record<string, unknown>>({});

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
    apiMessagesRef.current = nextApiMessages;

    try {
      const res = await fetch("/api/projekt/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, messages: nextApiMessages }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Något gick fel.");
        return;
      }

      apiMessagesRef.current = [
        ...nextApiMessages,
        { role: "assistant", content: data.message },
      ];

      const changeNote = describeChanges(answersRef.current, data.answers ?? {});
      answersRef.current = data.answers ?? {};
      onAnswersChange?.(answersRef.current);

      setTimeline((prev) => {
        const next: TimelineItem[] = [
          ...prev,
          { kind: "message", role: "assistant", content: data.message },
        ];
        if (changeNote) next.push({ kind: "confirmation", text: changeNote });
        appendRequestWidget(next, data.request);
        if (data.done && !hasGenerateStep(next)) {
          next.push({ kind: "generate-cta" });
        }
        return next;
      });
    } catch {
      setError("Kunde inte nå servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setIsLoading(false);
    }
  }

  function appendRequestWidget(next: TimelineItem[], request: InterviewRequest) {
    if (!request) return;
    const id = `${request}-${next.length}`;
    if (request === "situationsplan") {
      next.push({ kind: "situationsplan", id, saved: false, skipped: false });
    } else if (request === "detaljplan") {
      next.push({ kind: "detaljplan", id, uploaded: false, skipped: false });
    } else {
      const direction = request.slice("photo:".length) as Direction;
      next.push({ kind: "photo", id, direction, uploaded: false });
    }
  }

  function hasGenerateStep(items: TimelineItem[]) {
    return items.some((item) => item.kind === "generate-cta" || item.kind === "drawings");
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

  function handleDetaljplanUploaded(id: string) {
    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "detaljplan" && item.id === id ? { ...item, uploaded: true } : item,
      ),
    );
    onDetaljplanUploadedProp?.();
    send([
      ...apiMessagesRef.current,
      { role: "user", content: "[Jag har nu laddat upp detaljplanen.]" },
    ]);
  }

  function handleSkipDetaljplan(id: string) {
    setTimeline((prev) =>
      prev.map((item) =>
        item.kind === "detaljplan" && item.id === id ? { ...item, skipped: true } : item,
      ),
    );
    const text = "Jag har ingen detaljplan att ladda upp.";
    setTimeline((prev) => [...prev, { kind: "message", role: "user", content: text }]);
    send([...apiMessagesRef.current, { role: "user", content: text }]);
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
      const res = await fetch("/api/projekt/ritning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDrawingError(data.error ?? "Något gick fel.");
        return;
      }

      setTimeline((prev) => [
        ...prev,
        {
          kind: "drawings",
          drawings: {
            plan: data.plan,
            elevations: data.elevations,
            section: data.section,
            floorPlan: data.floorPlan,
            situationsplan: data.situationsplan ?? null,
          },
        },
      ]);
    } catch {
      setDrawingError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsGeneratingDrawings(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-muted/40 p-4">
        {timeline.map((item, i) => (
          <TimelineEntry
            key={i}
            item={item}
            userId={userId}
            projectId={projectId}
            isGeneratingDrawings={isGeneratingDrawings}
            drawingError={drawingError}
            onPhotoUploaded={handlePhotoUploaded}
            onSituationsplanSaved={handleSituationsplanSaved}
            onSkipSituationsplan={handleSkipSituationsplan}
            onDetaljplanUploaded={handleDetaljplanUploaded}
            onSkipDetaljplan={handleSkipDetaljplan}
            onGenerateDrawings={handleGenerateDrawings}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-background px-4 py-2.5 text-sm text-foreground/50">
              Eivor tänker…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ditt svar här…"
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Skicka"
          className="flex items-center justify-center rounded-lg bg-accent px-4 text-accent-foreground disabled:opacity-40"
        >
          <ArrowUpIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

function TimelineEntry({
  item,
  userId,
  projectId,
  isGeneratingDrawings,
  drawingError,
  onPhotoUploaded,
  onSituationsplanSaved,
  onSkipSituationsplan,
  onDetaljplanUploaded,
  onSkipDetaljplan,
  onGenerateDrawings,
}: {
  item: TimelineItem;
  userId: string;
  projectId: string;
  isGeneratingDrawings: boolean;
  drawingError: string | null;
  onPhotoUploaded: (id: string, direction: Direction) => void;
  onSituationsplanSaved: (id: string) => void;
  onSkipSituationsplan: (id: string) => void;
  onDetaljplanUploaded: (id: string) => void;
  onSkipDetaljplan: (id: string) => void;
  onGenerateDrawings: () => void;
}) {
  if (item.kind === "message") {
    return (
      <div className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
            item.role === "user"
              ? "bg-accent text-accent-foreground"
              : "bg-background text-foreground"
          }`}
        >
          {item.content}
        </div>
      </div>
    );
  }

  if (item.kind === "confirmation") {
    return (
      <p className="pl-1 text-xs text-foreground/50 italic">
        ✓ {item.text}
      </p>
    );
  }

  if (item.kind === "photo") {
    return (
      <div className="max-w-[85%] rounded-2xl bg-background p-3">
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
      <div className="max-w-full rounded-2xl bg-background p-3">
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

  if (item.kind === "detaljplan") {
    if (item.skipped) {
      return <p className="pl-1 text-xs text-foreground/50 italic">✓ Detaljplan hoppas över</p>;
    }
    if (item.uploaded) {
      return <p className="pl-1 text-xs text-foreground/50 italic">✓ Detaljplan uppladdad</p>;
    }
    return (
      <div className="max-w-full rounded-2xl bg-background p-3">
        <DetaljplanUpload
          projectId={projectId}
          hasExistingUpload={false}
          onUploaded={() => onDetaljplanUploaded(item.id)}
        />
        <button
          type="button"
          onClick={() => onSkipDetaljplan(item.id)}
          className="mt-2 text-xs text-foreground/50 hover:text-foreground/80"
        >
          Jag har ingen detaljplan →
        </button>
      </div>
    );
  }

  if (item.kind === "generate-cta") {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={onGenerateDrawings}
          disabled={isGeneratingDrawings}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isGeneratingDrawings ? "Genererar…" : "Generera ritningar"}
        </button>
        {drawingError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {drawingError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DrawingCard title="Planritning (volym)" svg={item.drawings.plan} />
      <div className="grid gap-6 sm:grid-cols-2">
        {DIRECTIONS.map((direction) => (
          <DrawingCard
            key={direction}
            title={`Fasad ${DIRECTION_LABEL[direction].toLowerCase()}`}
            svg={item.drawings.elevations[direction]}
          />
        ))}
      </div>
      <DrawingCard title="Sektion A-A" svg={item.drawings.section} />
      <DrawingCard title="Planritning" svg={item.drawings.floorPlan} />
      {item.drawings.situationsplan && (
        <DrawingCard title="Situationsplan" svg={item.drawings.situationsplan} />
      )}
    </div>
  );
}

function DrawingCard({ title, svg }: { title: string; svg: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
        {title}
      </p>
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
