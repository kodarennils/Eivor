"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { takePendingAssessment } from "@/lib/pending-assessment";
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  EMPTY_ANSWERS,
  PROJECT_TYPE_OPTIONS,
  ROOM_TYPE_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
  type ProjectAnswers,
  type Room,
} from "@/lib/project-fields";
import { ImageUploadSlot } from "@/components/ImageUploadSlot";
import { DetaljplanUpload } from "@/components/DetaljplanUpload";
import { SituationsplanUpload } from "@/components/SituationsplanUpload";
import { parseAssistantMessage, type Verdict } from "@/lib/verdict";

type Project = {
  id: string;
  initial_description: string | null;
  assessment_verdict: string | null;
  assessment_summary: string | null;
  detaljplan_storage_path: string | null;
  situationsplan_storage_path: string | null;
};

export default function ProjektPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [answers, setAnswers] = useState<ProjectAnswers>(EMPTY_ANSWERS);
  const [imagePaths, setImagePaths] = useState<Partial<Record<string, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessment, setAssessment] = useState<{
    text: string;
    verdict?: Verdict;
    usedDetaljplan: boolean;
  } | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawings, setDrawings] = useState<{
    plan: string;
    elevations: Record<string, string>;
    section: string;
    floorPlan: string;
    situationsplan: string | null;
  } | null>(null);
  const [drawingError, setDrawingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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

      const { data: existingProjects } = await supabase
        .from("projects")
        .select(
          "id, initial_description, assessment_verdict, assessment_summary, detaljplan_storage_path, situationsplan_storage_path",
        )
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(1);

      let currentProject = existingProjects?.[0] as Project | undefined;

      if (!currentProject) {
        const pending = takePendingAssessment();
        const { data: created, error } = await supabase
          .from("projects")
          .insert({
            user_id: currentUser.id,
            initial_description: pending?.description ?? null,
            assessment_verdict: pending?.verdict ?? null,
            assessment_summary: pending?.summary ?? null,
          })
          .select(
            "id, initial_description, assessment_verdict, assessment_summary, detaljplan_storage_path, situationsplan_storage_path",
          )
          .single();

        if (error || !created) {
          if (!cancelled) setIsLoading(false);
          return;
        }
        currentProject = created;
      }

      if (cancelled) return;
      setProject(currentProject);

      const [{ data: answerRow }, { data: imageRows }] = await Promise.all([
        supabase
          .from("project_answers")
          .select("answers")
          .eq("project_id", currentProject.id)
          .maybeSingle(),
        supabase
          .from("project_images")
          .select("direction, storage_path")
          .eq("project_id", currentProject.id),
      ]);

      if (cancelled) return;
      if (answerRow?.answers) {
        setAnswers({ ...EMPTY_ANSWERS, ...(answerRow.answers as Partial<ProjectAnswers>) });
      }
      if (imageRows) {
        const paths: Record<string, string> = {};
        for (const row of imageRows) paths[row.direction] = row.storage_path;
        setImagePaths(paths);
      }
      setIsLoading(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setIsSaving(true);
    setSaveMessage(null);

    const { error } = await supabase
      .from("project_answers")
      .upsert({ project_id: project.id, answers }, { onConflict: "project_id" });

    setIsSaving(false);
    setSaveMessage(error ? "Kunde inte spara. Försök igen." : "Sparat.");
  }

  async function handleUpdateAssessment() {
    if (!project) return;
    setIsAssessing(true);
    setAssessmentError(null);
    setAssessment(null);

    const description = [project.initial_description, answers.description]
      .filter(Boolean)
      .join("\n\n") || "Se bifogade uppgifter om projektet.";

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: description }],
          projectId: project.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAssessmentError(data.error ?? "Något gick fel.");
        return;
      }

      const parsed = parseAssistantMessage(data.message);
      setAssessment({
        text: parsed.text,
        verdict: parsed.verdict,
        usedDetaljplan: Boolean(data.usedDetaljplan),
      });
    } catch {
      setAssessmentError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsAssessing(false);
    }
  }

  async function handleGenerateDrawing() {
    if (!project) return;
    setIsDrawing(true);
    setDrawingError(null);
    setDrawings(null);

    try {
      const res = await fetch("/api/projekt/ritning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDrawingError(data.error ?? "Något gick fel.");
        return;
      }

      setDrawings({
        plan: data.plan,
        elevations: data.elevations,
        section: data.section,
        floorPlan: data.floorPlan,
        situationsplan: data.situationsplan ?? null,
      });
    } catch {
      setDrawingError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsDrawing(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  function updateField<K extends keyof ProjectAnswers>(key: K, value: ProjectAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function addRoom() {
    updateField("rooms", [...answers.rooms, { type: ROOM_TYPE_OPTIONS[0], percentage: "" }]);
  }

  function updateRoom(index: number, patch: Partial<Room>) {
    updateField(
      "rooms",
      answers.rooms.map((room, i) => (i === index ? { ...room, ...patch } : room)),
    );
  }

  function removeRoom(index: number) {
    updateField(
      "rooms",
      answers.rooms.filter((_, i) => i !== index),
    );
  }

  const roomPercentageTotal = answers.rooms.reduce(
    (sum, room) => sum + (Number(room.percentage) || 0),
    0,
  );

  if (isLoading) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 items-center justify-center px-4 py-24">
        <p className="text-sm text-foreground/50">Laddar…</p>
      </main>
    );
  }

  if (!user || !project) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 items-center justify-center px-4 py-24">
        <p className="text-sm text-red-700">
          Kunde inte ladda ditt ärende. Försök ladda om sidan.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ditt ärende</h1>
          <p className="text-sm text-foreground/50">{user.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-foreground/50 hover:text-foreground/80"
        >
          Logga ut
        </button>
      </header>

      {project.initial_description && (
        <div className="mb-8 rounded-lg border border-border bg-muted p-4 text-sm">
          <p className="font-medium">Från din beskrivning</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground/70">
            {project.initial_description}
          </p>
          {project.assessment_summary && (
            <p className="mt-2 text-foreground/70">{project.assessment_summary}</p>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Om projektet
          </h2>

          <Field label="Typ av åtgärd">
            <select
              value={answers.projectType}
              onChange={(e) => updateField("projectType", e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Välj…</option>
              {PROJECT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Beskriv projektet">
            <textarea
              value={answers.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Bredd (meter)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={answers.widthMeters}
                onChange={(e) => updateField("widthMeters", e.target.value)}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Djup (meter)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={answers.depthMeters}
                onChange={(e) => updateField("depthMeters", e.target.value)}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Yta (kvadratmeter)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={answers.areaSqm}
                onChange={(e) => updateField("areaSqm", e.target.value)}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Höjd till nock (meter)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={answers.heightMeters}
                onChange={(e) => updateField("heightMeters", e.target.value)}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
          </div>

          <Field label="Avstånd till tomtgräns (meter)">
            <input
              type="number"
              min="0"
              step="0.1"
              value={answers.distanceToBoundaryMeters}
              onChange={(e) => updateField("distanceToBoundaryMeters", e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="Ligger fastigheten inom detaljplanerat område?">
            <select
              value={answers.withinDetailedPlan}
              onChange={(e) => updateField("withinDetailedPlan", e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Välj…</option>
              {YES_NO_UNKNOWN_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fastighetsbeteckning (frivilligt)">
            <input
              type="text"
              value={answers.propertyDesignation}
              onChange={(e) => updateField("propertyDesignation", e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Rumsindelning (för planritning)
          </h2>

          <div className="flex flex-col gap-2">
            {answers.rooms.map((room, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={room.type}
                  onChange={(e) => updateRoom(index, { type: e.target.value })}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {ROOM_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={room.percentage}
                  onChange={(e) => updateRoom(index, { percentage: e.target.value })}
                  placeholder="% av ytan"
                  className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => removeRoom(index)}
                  className="text-sm text-foreground/50 hover:text-red-700"
                >
                  Ta bort
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={addRoom}
                className="self-start rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
              >
                + Lägg till rum
              </button>
              {answers.rooms.length > 0 && (
                <span
                  className={`text-xs ${roomPercentageTotal === 100 ? "text-foreground/50" : "text-amber-700"}`}
                >
                  Summa: {roomPercentageTotal}% {roomPercentageTotal !== 100 && "(bör bli 100%)"}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {DIRECTIONS.map((direction) => (
              <Field key={direction} label={`Fönster ${DIRECTION_LABEL[direction].toLowerCase()}`}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={answers.windowsPerDirection[direction]}
                  onChange={(e) =>
                    updateField("windowsPerDirection", {
                      ...answers.windowsPerDirection,
                      [direction]: e.target.value,
                    })
                  }
                  className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
              </Field>
            ))}
          </div>

          <Field label="Ytterdörr, huvudentré">
            <select
              value={answers.mainEntranceDirection}
              onChange={(e) => updateField("mainEntranceDirection", e.target.value)}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Välj…</option>
              {DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {DIRECTION_LABEL[direction]}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Fasadfoton
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {DIRECTIONS.map((direction) => (
              <ImageUploadSlot
                key={direction}
                userId={user.id}
                projectId={project.id}
                direction={direction}
                initialStoragePath={imagePaths[direction]}
              />
            ))}
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {isSaving ? "Sparar…" : "Spara"}
          </button>
          {saveMessage && <span className="text-sm text-foreground/50">{saveMessage}</span>}
        </div>
      </form>

      <section className="mt-10 flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Situationsplan (valfritt)
          </h2>
          <p className="mt-1 text-sm text-foreground/70">
            Har du en nybyggnadskarta för fastigheten? Ladda upp den, kalibrera skalan
            genom att klicka två punkter med känt avstånd (t.ex. skalstockens ändar),
            och markera var byggnaden ska stå. Utan nybyggnadskarta genereras ingen
            situationsplan.
          </p>
        </div>
        <SituationsplanUpload
          projectId={project.id}
          hasExisting={Boolean(project.situationsplan_storage_path)}
        />
      </section>

      <section className="mt-10 flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Ritning
          </h2>
          <p className="mt-1 text-sm text-foreground/70">
            Genererar en skalenlig planritning, fyra fasadritningar och en sektion
            från bredd/djup/höjd i formuläret ovan (spara formuläret först).
            Fasadmaterial och kulör läses av från de uppladdade fasadfotona och
            läggs till som textetiketter - de påverkar aldrig själva geometrin.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateDrawing}
          disabled={isDrawing}
          className="self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isDrawing ? "Genererar…" : "Generera ritning"}
        </button>

        {drawingError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {drawingError}
          </p>
        )}

        {drawings && (
          <div className="flex flex-col gap-6">
            <DrawingCard title="Planritning (volym)" svg={drawings.plan} />
            <div className="grid gap-6 sm:grid-cols-2">
              {DIRECTIONS.map((direction) => (
                <DrawingCard
                  key={direction}
                  title={`Fasad ${DIRECTION_LABEL[direction].toLowerCase()}`}
                  svg={drawings.elevations[direction]}
                />
              ))}
            </div>
            <DrawingCard title="Sektion A-A" svg={drawings.section} />
            <DrawingCard title="Planritning" svg={drawings.floorPlan} />
            {drawings.situationsplan && (
              <DrawingCard title="Situationsplan" svg={drawings.situationsplan} />
            )}
          </div>
        )}
      </section>

      <section className="mt-10 flex flex-col gap-4 border-t border-border pt-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Detaljplan (valfritt)
          </h2>
          <p className="mt-1 text-sm text-foreground/70">
            Ladda upp detaljplanen för din fastighet (PDF) så väger Eivor in lokala
            bestämmelser i bedömningen. Utan detaljplan baseras bedömningen bara på
            nationella regler.
          </p>
        </div>
        <DetaljplanUpload
          projectId={project.id}
          hasExistingUpload={Boolean(project.detaljplan_storage_path)}
        />
      </section>

      <section className="mt-10 flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Bedömning
        </h2>
        <button
          type="button"
          onClick={handleUpdateAssessment}
          disabled={isAssessing}
          className="self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isAssessing ? "Bedömer…" : "Uppdatera bedömning"}
        </button>

        {assessmentError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {assessmentError}
          </p>
        )}

        {assessment && (
          <div className="rounded-lg border border-border bg-muted p-4 text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
              {assessment.usedDetaljplan
                ? "Baserad på nationella regler + din detaljplan"
                : "Baserad på nationella regler"}
            </p>
            <p className="whitespace-pre-wrap text-foreground/80">{assessment.text}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
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
