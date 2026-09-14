"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, BuildingIcon, PaperclipIcon } from "@/components/icons";
import { ImageUploadSlot } from "@/components/ImageUploadSlot";
import { SituationsplanUpload } from "@/components/SituationsplanUpload";
import { DetaljplanUpload } from "@/components/DetaljplanUpload";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@/lib/project-fields";
import { describeChanges, phaseProgress, type InterviewRequest } from "@/lib/interview";
import { buildTekniskBeskrivning, type TekniskBeskrivning } from "@/lib/teknisk-beskrivning";
import type { KontrollplanPunkt } from "@/app/api/projekt/kontrollplan/route";
import { ReviewScreen } from "@/components/ReviewScreen";
import type { FacadeAttribute } from "@/components/editable-answer-fields";

type ApiMessage = { role: "user" | "assistant"; content: string };

type Drawings = {
  plan: string;
  elevations: Record<Direction, string>;
  section: string;
  floorPlan: string;
  situationsplan: string | null;
  kontrollplan: KontrollplanPunkt[];
  kontrollplanError: string | null;
  tekniskBeskrivning: TekniskBeskrivning;
};

const DETALJPLAN_ANSWER_TEXT: Record<"Ja" | "Nej" | "Vet inte", string> = {
  Ja: "Ja, fastigheten omfattas av detaljplan.",
  Nej: "Nej, den ligger utanför detaljplan.",
  "Vet inte": "Jag vet inte.",
};

type TimelineItem =
  | { kind: "message"; role: "user" | "assistant"; content: string }
  | { kind: "confirmation"; text: string }
  | { kind: "photo"; id: string; direction: Direction; uploaded: boolean }
  | { kind: "situationsplan"; id: string; saved: boolean; skipped: boolean }
  | { kind: "detaljplan-status"; id: string; resolvedLabel: string | null }
  | { kind: "generate-cta" }
  | { kind: "drawings"; drawings: Drawings };

export function ProjectInterviewChat({
  userId,
  projectId,
  answers = {},
  photos = {},
  facadeAttributes = {},
  onAnswersChange,
  onFacadeAttributeChange,
  onPhotoUploaded: onPhotoUploadedProp,
  onSituationsplanSaved: onSituationsplanSavedProp,
  onDetaljplanUploaded: onDetaljplanUploadedProp,
}: {
  userId: string;
  projectId: string;
  answers: Record<string, unknown>;
  photos?: Partial<Record<Direction, string>>;
  facadeAttributes?: Partial<Record<Direction, FacadeAttribute>>;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onFacadeAttributeChange?: (direction: Direction, attribute: FacadeAttribute) => void;
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
    } else if (request === "detaljplan-status") {
      next.push({ kind: "detaljplan-status", id, resolvedLabel: null });
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
            kontrollplan,
            kontrollplanError,
            tekniskBeskrivning: buildTekniskBeskrivning(answers, data.facadeAttributes ?? {}),
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
              photos={photos}
              facadeAttributes={facadeAttributes}
              isGeneratingDrawings={isGeneratingDrawings}
              drawingError={drawingError}
              onAnswersChange={onAnswersChange}
              onFacadeAttributeChange={onFacadeAttributeChange}
              onPhotoUploaded={handlePhotoUploaded}
              onSituationsplanSaved={handleSituationsplanSaved}
              onSkipSituationsplan={handleSkipSituationsplan}
              onDetaljplanStatusAnswer={handleDetaljplanStatusAnswer}
              onDetaljplanUpload={handleDetaljplanUpload}
              onGenerateDrawings={handleGenerateDrawings}
            />
          ))}

          {isLoading && (
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
  photos,
  facadeAttributes,
  isGeneratingDrawings,
  drawingError,
  onAnswersChange,
  onFacadeAttributeChange,
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
  photos: Partial<Record<Direction, string>>;
  facadeAttributes: Partial<Record<Direction, FacadeAttribute>>;
  isGeneratingDrawings: boolean;
  drawingError: string | null;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onFacadeAttributeChange?: (direction: Direction, attribute: FacadeAttribute) => void;
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
            {item.content}
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

  if (item.kind === "generate-cta") {
    return (
      <ReviewScreen
        projectId={projectId}
        answers={answers}
        photos={photos}
        facadeAttributes={facadeAttributes}
        onAnswersChange={onAnswersChange ?? (() => {})}
        onFacadeAttributeChange={onFacadeAttributeChange ?? (() => {})}
        onGenerate={onGenerateDrawings}
        isGenerating={isGeneratingDrawings}
        error={drawingError}
      />
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
      <KontrollplanCard
        punkter={item.drawings.kontrollplan}
        error={item.drawings.kontrollplanError}
      />
      <TekniskBeskrivningCard data={item.drawings.tekniskBeskrivning} />
    </div>
  );
}

function KontrollplanCard({
  punkter,
  error,
}: {
  punkter: KontrollplanPunkt[];
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-foreground/50 uppercase">
        Förslag till kontrollplan
      </p>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-foreground/50">
                  <th className="py-2 pr-3 font-medium">Kontrollpunkt</th>
                  <th className="py-2 pr-3 font-medium">Utförs av</th>
                  <th className="py-2 font-medium">När</th>
                </tr>
              </thead>
              <tbody>
                {punkter.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{p.kontrollpunkt}</td>
                    <td className="py-2 pr-3 text-foreground/70">{p.utforsAv}</td>
                    <td className="py-2 text-foreground/70">{p.nar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-foreground/60">
            Detta är ett förslag till kontrollplan baserat på ditt ärende. Det ska granskas
            och fastställas tillsammans med din kontrollansvarig och/eller byggnadsnämnden.
          </p>
        </>
      )}
    </div>
  );
}

function TekniskBeskrivningCard({ data }: { data: TekniskBeskrivning }) {
  const rows: [string, string][] = [
    ["Grundläggning", data.grundlaggning],
    ["Stomme / fasadmaterial", data.stomme],
    ["Ventilation", data.ventilation],
    ["Uppvärmning", data.uppvarmning],
  ];

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-foreground/50 uppercase">
        Teknisk beskrivning
      </p>
      <div className="divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2">
            <span className="text-foreground/60">{label}</span>
            <span className={value === "Ej angivet" ? "text-foreground/40" : "font-medium"}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawingCard({ title, svg }: { title: string; svg: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
        {title}
      </p>
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
