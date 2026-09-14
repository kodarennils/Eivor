"use client";

import type { Room } from "@/lib/project-fields";

// Shown instead of a bare "Generera ritningar" button once the interview
// signals done:true. Used to reuse the full editable-field components
// (editable-answer-fields.tsx) here too, but that duplicated the exact
// same data the document panel's "Om projektet"/"Mått" sections already
// show and let you edit - both rendered on screen at once. This is
// deliberately just a brief confirmation now: chat confirms what's
// about to happen, the document panel is where you actually change
// something.
export function ReviewScreen({
  answers,
  onGenerate,
  isGenerating,
  error,
}: {
  answers: Record<string, unknown>;
  onGenerate: () => void;
  isGenerating: boolean;
  error: string | null;
}) {
  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const dimensions = [answers.widthMeters, answers.depthMeters]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" × ");

  const summaryParts = [
    (answers.projectType as string) || null,
    dimensions ? `${dimensions} m` : null,
    answers.heightMeters ? `${answers.heightMeters} m till nock` : null,
    rooms.length ? `${rooms.length} ${rooms.length === 1 ? "rum" : "rum"}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="w-full rounded-2xl border border-border bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-foreground/50 uppercase">
        Redo att generera ritningar
      </p>
      <p className="mt-1 text-sm text-foreground/70">
        {summaryParts.length > 0 ? summaryParts.join(" · ") : "Allt underlag är insamlat."}
      </p>
      <p className="mt-1 text-xs text-foreground/50">
        Uppgifterna finns i översiktspanelen till höger - ändra där om något behöver rättas
        innan du genererar.
      </p>

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className="mt-4 w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
      >
        {isGenerating ? "Genererar…" : "Generera ritningar"}
      </button>
      {error && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
