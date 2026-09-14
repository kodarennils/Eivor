"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ProjectInterviewChat } from "@/components/ProjectInterviewChat";
import { ProjectDocument } from "@/components/ProjectDocument";
import { BuildingIcon, CheckIcon } from "@/components/icons";
import { parseAssistantMessage, type Verdict } from "@/lib/verdict";
import type { Direction } from "@/lib/project-fields";

const IMAGES_BUCKET = "project-images";

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

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<Partial<Record<Direction, string>>>({});
  const [detaljplanUploaded, setDetaljplanUploaded] = useState(false);
  const [situationsplanUploaded, setSituationsplanUploaded] = useState(false);
  const [assessment, setAssessment] = useState<{ verdict?: Verdict; summary?: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshPhotos(id: string) {
      const { data: imageRows } = await supabase
        .from("project_images")
        .select("direction, storage_path")
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

  async function refreshAssessment(nextAnswers: Record<string, unknown>) {
    if (!project) return;
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: buildAssessmentDescription(project.initial_description, nextAnswers),
            },
          ],
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
      .select("storage_path")
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

  return (
    <div className="flex h-dvh flex-col">
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
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

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <section className="flex h-1/2 min-h-0 flex-col overflow-hidden border-b-2 border-border bg-background p-4 md:h-full md:w-[40%] md:border-r-2 md:border-b-0 md:p-6">
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
              onAnswersChange={(next) => {
                setAnswers(next);
                refreshAssessment(next);
              }}
              onPhotoUploaded={refreshPhotoFor}
              onSituationsplanSaved={() => setSituationsplanUploaded(true)}
              onDetaljplanUploaded={() => setDetaljplanUploaded(true)}
            />
          </div>
        </section>

        <section className="h-1/2 flex-1 overflow-y-auto bg-muted md:h-full">
          <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-muted/95 px-6 backdrop-blur">
            <span className="text-sm font-medium">Översikt</span>
            <span className="flex items-center gap-1.5 text-xs text-foreground/50">
              <CheckIcon className="size-3.5 text-accent" /> Sparad automatiskt
            </span>
          </div>
          <article className="px-4 py-10 sm:px-10 sm:py-14">
            <ProjectDocument
              answers={answers}
              photos={photos}
              detaljplanUploaded={detaljplanUploaded}
              situationsplanUploaded={situationsplanUploaded}
              assessment={assessment}
            />
          </article>
        </section>
      </div>
    </div>
  );
}
