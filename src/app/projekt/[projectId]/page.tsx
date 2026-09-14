"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ProjectInterviewChat } from "@/components/ProjectInterviewChat";
import { ProjectDocument } from "@/components/ProjectDocument";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { BuildingIcon, CheckIcon, MenuIcon, CloseIcon } from "@/components/icons";
import { parseAssistantMessage, type Verdict } from "@/lib/verdict";
import type { Direction } from "@/lib/project-fields";
import type { GeneratedDrawings } from "@/lib/generated-drawings";
import type { DrawingModel } from "@/lib/drawing-schema";
import { computeOverviewSectionsPresence, hasAnyOverviewContent } from "@/lib/overview-sections";

const IMAGES_BUCKET = "project-images";

// Resizable chat/overview split (md+ only - the two panels stack on
// mobile instead of sitting side by side, so there's nothing to drag
// there). 40 matches the previous fixed md:w-[40%] left panel.
const DEFAULT_LEFT_PANEL_PCT = 40;
const MIN_LEFT_PANEL_PCT = 25;
const MAX_LEFT_PANEL_PCT = 65;
// A percentage-only range can still starve a panel to near-nothing on a
// narrower md-range viewport (25% of a 768px window is 192px) - this
// absolute floor is checked alongside the percentage bounds so neither
// panel ever collapses below a usable width regardless of window size.
const MIN_PANEL_PX = 320;

function clampLeftPanelPct(rawPct: number, containerWidthPx: number): number {
  const minPctForFloor = (MIN_PANEL_PX / containerWidthPx) * 100;
  const maxPctForFloor = 100 - (MIN_PANEL_PX / containerWidthPx) * 100;
  const lower = Math.max(MIN_LEFT_PANEL_PCT, minPctForFloor);
  const upper = Math.min(MAX_LEFT_PANEL_PCT, maxPctForFloor);
  // The container is so narrow that even both 320px floors can't fit
  // side by side - fall back to an even split rather than an
  // inverted/invalid clamp range.
  if (lower > upper) return 50;
  return Math.min(Math.max(rawPct, lower), upper);
}

type Project = {
  id: string;
  initial_description: string | null;
  assessment_verdict: string | null;
  assessment_summary: string | null;
  detaljplan_storage_path: string | null;
  situationsplan_storage_path: string | null;
};

function buildAssessmentDescription(
  initialDescription: string | null,
  answers: Record<string, unknown>,
): string {
  const parts: string[] = [];
  if (initialDescription) parts.push(initialDescription);
  if (typeof answers.description === "string" && answers.description) {
    parts.push(answers.description);
  }

  const facts: string[] = [];
  if (answers.projectType) facts.push(`Typ av åtgärd: ${answers.projectType}`);
  if (answers.widthMeters || answers.depthMeters) {
    facts.push(`Mått: ${answers.widthMeters ?? "?"} x ${answers.depthMeters ?? "?"} meter`);
  }
  if (answers.areaSqm) facts.push(`Yta: ${answers.areaSqm} kvm`);
  if (answers.heightMeters) facts.push(`Höjd till nock: ${answers.heightMeters} meter`);
  if (answers.distanceToBoundaryMeters) {
    facts.push(`Avstånd till tomtgräns: ${answers.distanceToBoundaryMeters} meter`);
  }
  if (answers.withinDetailedPlan) {
    facts.push(`Inom detaljplanerat område: ${answers.withinDetailedPlan}`);
  }
  if (facts.length) parts.push(facts.join("\n"));

  return parts.join("\n\n") || "Se bifogade uppgifter om projektet.";
}

export default function ProjektPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const supabase = createClient();

  // Dashboard sidebar as an on-demand overlay (not a permanently-visible
  // rail) - opening/closing it never touches the resizable chat/overview
  // split below, so it can't disturb leftPanelPct or require redoing its
  // min-width math. It reuses DashboardSidebar exactly as dashboard/
  // page.tsx and installningar/page.tsx already do, just inside a
  // fixed-position wrapper instead of a normal flex row.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen]);

  const [leftPanelPct, setLeftPanelPct] = useState(DEFAULT_LEFT_PANEL_PCT);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingDividerRef = useRef(false);

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingDividerRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Dragging over the chat/overview text without this selects it as a
    // side effect on every move - purely a drag-UX annoyance, not a data
    // issue, but distracting enough to be worth suppressing for the
    // duration of the drag.
    document.body.style.userSelect = "none";
  };
  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDividerRef.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPanelPct(clampLeftPanelPct(rawPct, rect.width));
  };
  const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingDividerRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
  };
  const handleDividerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const containerWidth = splitContainerRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return;
    const STEP_PCT = 2;
    if (e.key === "ArrowLeft") {
      setLeftPanelPct((pct) => clampLeftPanelPct(pct - STEP_PCT, containerWidth));
    } else if (e.key === "ArrowRight") {
      setLeftPanelPct((pct) => clampLeftPanelPct(pct + STEP_PCT, containerWidth));
    } else if (e.key === "Home") {
      setLeftPanelPct(clampLeftPanelPct(DEFAULT_LEFT_PANEL_PCT, containerWidth));
    }
  };

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<Partial<Record<Direction, string>>>({});
  const [facadeAttributes, setFacadeAttributes] = useState<
    Partial<Record<Direction, { material: string; color: string; confirmed: boolean }>>
  >({});
  const [detaljplanUploaded, setDetaljplanUploaded] = useState(false);
  const [situationsplanUploaded, setSituationsplanUploaded] = useState(false);
  // Lifted out of ProjectInterviewChat so the chat (which triggers
  // generation) and the document panel (which now renders the result)
  // can share it - the chat itself never renders a drawing inline again.
  const [generatedDrawings, setGeneratedDrawings] = useState<GeneratedDrawings | null>(null);
  // Lifted out of RitningarSection (was local state there) so the future
  // NL-editing input (NL-4, in the Redigera tab) can write to the same
  // model the canvas/form (Phase D) reads from and edits - same lift
  // pattern as generatedDrawings above. null means "no user edits yet,
  // follow the live answers-derived model" - see ProjectDocument.tsx.
  const [editedDrawingModel, setEditedDrawingModel] = useState<DrawingModel | null>(null);
  const [assessment, setAssessment] = useState<{ verdict?: Verdict; summary?: string } | null>(
    null,
  );
  // buildAssessmentDescription() only reads a handful of fields (see
  // below) - most interview turns (rooms, photos, kontrollansvarig,
  // wrapup) touch none of them, so re-running /api/assess for those would
  // send Claude an identical prompt and pay for a fresh classify call +
  // embedding + full assessment for a result that can't have changed.
  // Track what was last actually sent and skip the call when it repeats.
  const lastAssessedDescriptionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshPhotos(id: string) {
      const { data: imageRows } = await supabase
        .from("project_images")
        .select("direction, storage_path, material, color, attributes_confirmed")
        .eq("project_id", id);

      const entries = await Promise.all(
        (imageRows ?? []).map(async (row) => {
          const { data } = await supabase.storage
            .from(IMAGES_BUCKET)
            .createSignedUrl(row.storage_path, 3600);
          return [row.direction, data?.signedUrl] as const;
        }),
      );
      if (cancelled) return;
      setPhotos(
        Object.fromEntries(entries.filter(([, url]) => url)) as Partial<Record<Direction, string>>,
      );
      setFacadeAttributes(
        Object.fromEntries(
          (imageRows ?? [])
            .filter((row) => row.material && row.color)
            .map((row) => [
              row.direction,
              { material: row.material!, color: row.color!, confirmed: row.attributes_confirmed },
            ]),
        ) as Partial<Record<Direction, { material: string; color: string; confirmed: boolean }>>,
      );
    }

    async function bootstrap() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.replace("/konto/logga-in");
        return;
      }
      if (cancelled) return;
      setUser(currentUser);

      // RLS already scopes this to rows the current user owns, so a
      // project belonging to someone else - or a bad id - just comes
      // back empty rather than leaking whether it exists.
      const { data: currentProject } = await supabase
        .from("projects")
        .select(
          "id, initial_description, assessment_verdict, assessment_summary, detaljplan_storage_path, situationsplan_storage_path",
        )
        .eq("id", projectId)
        .maybeSingle();

      if (cancelled) return;
      if (!currentProject) {
        setIsLoading(false);
        return;
      }

      setProject(currentProject);
      setDetaljplanUploaded(Boolean(currentProject.detaljplan_storage_path));
      setSituationsplanUploaded(Boolean(currentProject.situationsplan_storage_path));
      if (currentProject.assessment_verdict) {
        setAssessment({
          verdict: currentProject.assessment_verdict as Verdict,
          summary: currentProject.assessment_summary ?? undefined,
        });
      }

      const { data: answerRow } = await supabase
        .from("project_answers")
        .select("answers")
        .eq("project_id", currentProject.id)
        .maybeSingle();
      if (cancelled) return;
      if (answerRow?.answers) setAnswers(answerRow.answers as Record<string, unknown>);

      await refreshPhotos(currentProject.id);
      if (!cancelled) setIsLoading(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function refreshAssessment(
    nextAnswers: Record<string, unknown>,
    options?: { force?: boolean },
  ) {
    if (!project) return;
    const description = buildAssessmentDescription(project.initial_description, nextAnswers);
    if (!options?.force && description === lastAssessedDescriptionRef.current) return;
    lastAssessedDescriptionRef.current = description;
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: description }],
          projectId: project.id,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const parsed = parseAssistantMessage(data.message);
      if (parsed.verdict) {
        setAssessment({ verdict: parsed.verdict, summary: parsed.summary });
      }
    } catch {
      // Silent - this is a background refresh, not a user-initiated action.
      // The conversation itself keeps working even if this fails.
    }
  }

  async function refreshPhotoFor(direction: Direction) {
    if (!project) return;
    const { data: imageRow } = await supabase
      .from("project_images")
      .select("storage_path, material, color, attributes_confirmed")
      .eq("project_id", project.id)
      .eq("direction", direction)
      .maybeSingle();
    if (!imageRow) return;
    const { data } = await supabase.storage
      .from(IMAGES_BUCKET)
      .createSignedUrl(imageRow.storage_path, 3600);
    if (data?.signedUrl) {
      setPhotos((prev) => ({ ...prev, [direction]: data.signedUrl }));
    }
    // ImageUploadSlot awaits /api/projekt/facade-analys before calling
    // onUploaded (which leads here), so this should already reflect the
    // fresh, unconfirmed analysis for the new photo.
    setFacadeAttributes((prev) => ({
      ...prev,
      [direction]:
        imageRow.material && imageRow.color
          ? { material: imageRow.material, color: imageRow.color, confirmed: imageRow.attributes_confirmed }
          : undefined,
    }));
  }

  // Shared by both the chat (ProjectInterviewChat) and the document
  // panel's editable fields (ProjectDocument) - a panel edit and a chat
  // answer both end up here, since both are just different ways of
  // producing the same project_answers update.
  function handleAnswersChange(next: Record<string, unknown>) {
    setAnswers(next);
    refreshAssessment(next);
  }

  function handleFacadeAttributeChange(
    direction: Direction,
    attribute: { material: string; color: string; confirmed: boolean },
  ) {
    setFacadeAttributes((prev) => ({ ...prev, [direction]: attribute }));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (isLoading) {
    return (
      <main className="flex h-dvh items-center justify-center px-4">
        <p className="text-sm text-foreground/50">Laddar…</p>
      </main>
    );
  }

  if (!user || !project) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-red-700">
          Kunde inte hitta det här ärendet. Det kan ha tagits bort, eller så tillhör det
          ett annat konto.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-accent hover:underline">
          ← Till dina ärenden
        </Link>
      </main>
    );
  }

  const caseTitle =
    [answers.projectType, answers.propertyDesignation].filter(Boolean).join(" · ") ||
    "Ditt ärende";

  // A brand-new project (nothing collected yet) renders the chat
  // fullwidth with no overview panel at all, rather than a panel full of
  // placeholder dashes - see lib/overview-sections.ts, the same presence
  // computation ProjectDocument uses per-section internally. The panel
  // (and the resizable divider) only mount once there's at least one
  // real value anywhere to show.
  const overviewPresence = computeOverviewSectionsPresence({
    answers,
    photos,
    assessment,
    generatedDrawings,
    editedDrawingModel,
    detaljplanUploaded,
    situationsplanUploaded,
  });
  const showOverviewPanel = hasAnyOverviewContent(overviewPresence);

  return (
    <div className="flex h-dvh flex-col">
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Öppna meny"
            aria-expanded={isSidebarOpen}
            className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/50 hover:bg-muted hover:text-foreground/80"
          >
            <MenuIcon className="size-4.5" />
          </button>
          <Link href="/dashboard" className="inline-flex shrink-0 items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-xl bg-accent text-accent-foreground">
              <BuildingIcon className="size-4" />
            </span>
            <span className="text-lg font-semibold">Eivor</span>
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <h1 className="truncate text-sm font-medium">{caseTitle}</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="hidden text-sm text-foreground/50 hover:text-foreground/80 sm:inline"
          >
            ← Ärenden
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-foreground/50 hover:text-foreground/80"
          >
            Logga ut
          </button>
        </div>
      </header>

      {/* Always mounted (not conditionally rendered) so opacity/transform
          transitions actually have something to animate between - a
          conditional {isSidebarOpen && ...} would pop in/out instantly
          instead of sliding. Closing it never touches the resizable
          split below: this is a fixed-position overlay outside normal
          document flow, so leftPanelPct and its layout are untouched. */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${
          isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isSidebarOpen}
      >
        {/* A real <button>, not a div with onClick - focusable and
            keyboard-activatable (Enter/Space) for free, and unambiguous
            that it's clickable (cursor-pointer + hover dimming), not
            just decorative dimming with hidden functionality. */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Stäng meny"
          tabIndex={isSidebarOpen ? 0 : -1}
          className="absolute inset-0 h-full w-full cursor-pointer bg-black/30 transition-colors hover:bg-black/40"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Meny"
          className={`relative flex h-full items-start transition-transform duration-200 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <DashboardSidebar user={user} onSignOut={handleSignOut} />
          {/* Explicit, always-visible close affordance right next to the
              panel - doesn't rely on the user noticing the scrim (or the
              backdrop button above) is clickable at all. */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Stäng meny"
            tabIndex={isSidebarOpen ? 0 : -1}
            className="mt-4 ml-3 flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-foreground/60 shadow-md hover:bg-muted hover:text-foreground/90"
          >
            <CloseIcon className="size-4.5" />
          </button>
        </div>
      </div>

      <div
        ref={splitContainerRef}
        className="flex flex-1 flex-col overflow-hidden md:flex-row"
        style={{ "--left-panel-pct": `${leftPanelPct}%` } as React.CSSProperties}
      >
        <section
          className={
            showOverviewPanel
              ? "flex h-1/2 min-h-0 flex-col overflow-hidden border-b-2 border-border bg-background p-4 md:h-full md:w-[var(--left-panel-pct)] md:border-b-0 md:p-6"
              : "flex h-full min-h-0 w-full flex-col overflow-hidden bg-background p-4 md:p-6"
          }
        >
          {project.initial_description && (
            <div className="mb-4 shrink-0 rounded-xl border border-border bg-muted p-4 text-sm">
              <p className="font-medium">Från din beskrivning</p>
              <p className="mt-1 whitespace-pre-wrap text-foreground/70">
                {project.initial_description}
              </p>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ProjectInterviewChat
              userId={user.id}
              projectId={project.id}
              answers={answers}
              photos={photos}
              isEmptyState={!showOverviewPanel}
              onAnswersChange={handleAnswersChange}
              onDrawingsGenerated={setGeneratedDrawings}
              onPhotoUploaded={refreshPhotoFor}
              onSituationsplanSaved={() => setSituationsplanUploaded(true)}
              onDetaljplanUploaded={() => {
                setDetaljplanUploaded(true);
                // buildAssessmentDescription() never encodes "a detaljplan
                // file was uploaded" - only the Ja/Nej/Vet-inte answer
                // text, which is often already set by this point. /api/assess
                // reads the uploaded detaljplan_text independently from the
                // DB, so the throttle below would otherwise skip this call
                // and the panel would never pick up a verdict change from
                // the upload itself. Force it here.
                refreshAssessment(answers, { force: true });
              }}
            />
          </div>
        </section>

        {showOverviewPanel && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Ändra bredd på panelerna"
              aria-valuenow={Math.round(leftPanelPct)}
              aria-valuemin={MIN_LEFT_PANEL_PCT}
              aria-valuemax={MAX_LEFT_PANEL_PCT}
              tabIndex={0}
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
              onKeyDown={handleDividerKeyDown}
              className="hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-border transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none md:block"
            />

            <section className="h-1/2 flex-1 overflow-y-auto bg-muted md:h-full">
              <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-muted/95 px-6 backdrop-blur">
                <span className="text-sm font-medium">Översikt</span>
                <span className="flex items-center gap-1.5 text-xs text-foreground/50">
                  <CheckIcon className="size-3.5 text-accent" /> Sparad automatiskt
                </span>
              </div>
              <article className="px-4 py-10 sm:px-10 sm:py-14">
                <ProjectDocument
                  projectId={project.id}
                  answers={answers}
                  photos={photos}
                  facadeAttributes={facadeAttributes}
                  detaljplanUploaded={detaljplanUploaded}
                  situationsplanUploaded={situationsplanUploaded}
                  assessment={assessment}
                  generatedDrawings={generatedDrawings}
                  editedDrawingModel={editedDrawingModel}
                  onEditedDrawingModelChange={setEditedDrawingModel}
                  onAnswersChange={handleAnswersChange}
                  onFacadeAttributeChange={handleFacadeAttributeChange}
                />
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
