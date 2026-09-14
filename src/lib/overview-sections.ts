// Empty-state gating for the overview panel (ProjectDocument.tsx): a
// brand-new project used to render every section immediately, full of
// hardcoded placeholders ("—", "Inväntar beskrivning i chatten") before
// any real data existed. New behavior - a section only renders once it
// has at least one real value, and the whole panel only appears once
// ANY section does (page.tsx renders the chat fullwidth until then).
//
// Shared between page.tsx (which needs this to decide the outer
// fullwidth-vs-split layout, before ProjectDocument even mounts) and
// ProjectDocument.tsx (which needs the same per-section booleans to
// decide what to render) - one source of truth so the two can't
// silently disagree about what counts as "has content" the way two
// independent re-derivations could drift apart over time.

import { DIRECTIONS, type Direction, type Room } from "@/lib/project-fields";
import type { Verdict } from "@/lib/verdict";
import type { GeneratedDrawings } from "@/lib/generated-drawings";
import type { DrawingModel } from "@/lib/drawing-schema";
import { buildDrawingModelFromAnswers } from "@/lib/drawing-schema-from-answers";

export type OverviewSectionsPresence = {
  omProjektet: boolean;
  matt: boolean;
  bedomning: boolean;
  kontrollansvarig: boolean;
  fasadmaterial: boolean;
  ritningar: boolean;
  bilagor: boolean;
};

// Field-level presence within "Om projektet" and "Mått" - the two
// sections with several independent sub-fields under one gate.
// Section-level presence (below) is DERIVED from these, not
// recomputed separately, so the two can never disagree about what
// counts as "has content": a section can only be true because at
// least one of these was true. Bedömning/Kontrollansvarig/
// Fasadmaterial/Ritningar/Bilagor don't need this - each is either one
// atomic value (a verdict+summary pair) or already only ever renders
// items that individually have real data (a photo, a generated
// drawing) - see the comment on computeOverviewSectionsPresence.
export type OverviewFieldPresence = {
  projectType: boolean;
  withinDetailedPlan: boolean;
  rooms: boolean;
  // Fönster per väderstreck is gated as ONE block (any direction with a
  // real count reveals the whole block), not per-direction - confirmed
  // deliberate, not an oversight: showing a lone "Norr: 2" row while the
  // other three still read as empty/zero would be its own confusing
  // partial-placeholder state.
  windowsPerDirection: boolean;
  widthMeters: boolean;
  depthMeters: boolean;
  areaSqm: boolean;
  heightMeters: boolean;
  distanceToBoundaryMeters: boolean;
};

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function computeOverviewFieldPresence(answers: Record<string, unknown>): OverviewFieldPresence {
  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirection = (answers.windowsPerDirection ?? {}) as Partial<Record<Direction, string>>;

  return {
    projectType: isFilled(answers.projectType),
    withinDetailedPlan: isFilled(answers.withinDetailedPlan),
    rooms: rooms.length > 0,
    windowsPerDirection: DIRECTIONS.some((d) => isFilled(windowsPerDirection[d])),
    widthMeters: isFilled(answers.widthMeters),
    depthMeters: isFilled(answers.depthMeters),
    areaSqm: isFilled(answers.areaSqm),
    heightMeters: isFilled(answers.heightMeters),
    distanceToBoundaryMeters: isFilled(answers.distanceToBoundaryMeters),
  };
}

export function computeOverviewSectionsPresence(args: {
  answers: Record<string, unknown>;
  photos: Partial<Record<Direction, string>>;
  assessment: { verdict?: Verdict; summary?: string } | null;
  generatedDrawings: GeneratedDrawings | null;
  editedDrawingModel: DrawingModel | null;
  detaljplanUploaded: boolean;
  situationsplanUploaded: boolean;
}): OverviewSectionsPresence {
  const {
    answers,
    photos,
    assessment,
    generatedDrawings,
    editedDrawingModel,
    detaljplanUploaded,
    situationsplanUploaded,
  } = args;

  const fields = computeOverviewFieldPresence(answers);
  const hasAnyPhoto = DIRECTIONS.some((d) => Boolean(photos[d]));

  const omProjektet =
    fields.projectType || fields.withinDetailedPlan || fields.rooms || fields.windowsPerDirection;

  const matt =
    fields.widthMeters || fields.depthMeters || fields.areaSqm || fields.heightMeters || fields.distanceToBoundaryMeters;

  const bedomning = Boolean(assessment?.verdict);

  const kontrollansvarig = answers.requiresKontrollansvarig === "Ja";

  const fasadmaterial = hasAnyPhoto;

  // Same "editedModel ?? live-from-answers" derivation RitningarSection
  // itself uses (ProjectDocument.tsx) - kept as one inline expression
  // rather than a shared sub-function since it's already a one-liner and
  // trivially easy to keep the two in visual sync.
  const ritningar = Boolean(editedDrawingModel ?? buildDrawingModelFromAnswers(answers)) || Boolean(generatedDrawings);

  const bilagor = hasAnyPhoto || situationsplanUploaded || detaljplanUploaded;

  return { omProjektet, matt, bedomning, kontrollansvarig, fasadmaterial, ritningar, bilagor };
}

export function hasAnyOverviewContent(presence: OverviewSectionsPresence): boolean {
  return Object.values(presence).some(Boolean);
}
