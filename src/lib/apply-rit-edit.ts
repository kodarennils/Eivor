// NL-3: applies a ParsedRitEdit (NL-2) to the shared DrawingModel state
// (page.tsx's editedDrawingModel - the same state Phase D's canvas/form
// reads and writes). A pure function, deliberately: NL-4's UI just calls
// this and setState()s the result, same shape as the rest of this
// session's "state lives in page.tsx, components read/write through
// callbacks" pattern.
//
// Every numeric result is clamped to stay physically valid - never
// silently reject an edit that's directionally correct but slightly too
// large, and never let a bad number corrupt the drawing either. When
// clamping changes what was actually requested, `note` explains that in
// plain Swedish so the edit-input UI (NL-4) can show it alongside the
// model's own confirmation message - "clamp and explain", not "clamp
// and stay silent".

import type { DrawingModel, Window, Door } from "@/lib/drawing-schema";
import { findWall, wallLengthMm, clampOffsetToWall, leftRightOffsetDeltaMm } from "@/lib/drawing-schema";
import type { ParsedRitEdit } from "@/lib/rit-edit";

export type ApplyRitEditResult = {
  model: DrawingModel;
  // Non-null only when the applied value differs from what was literally
  // requested (clamped to fit the wall, or floored to stay a sane
  // measurement) - null means the edit applied exactly as asked.
  note: string | null;
};

// Below this, a window/door's own width or height stops being a
// meaningful measurement (not a real building constraint - there isn't
// one elsewhere in this codebase, see buildDrawingModelFromAnswers/
// fitsOnWall - just a floor against a delta driving a value to zero or
// negative). Sill height has no such floor: 0mm (floor-to-ceiling) is a
// legitimate window, so it's excluded below.
const MIN_DIMENSION_MM = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function findElement(model: DrawingModel, targetId: string): Window | Door | undefined {
  return model.windows.find((w) => w.id === targetId) ?? model.doors.find((d) => d.id === targetId);
}

function isWindow(element: Window | Door): element is Window {
  return "sillHeightMm" in element;
}

function updateOffset(model: DrawingModel, targetId: string, offsetMm: number): DrawingModel {
  return {
    ...model,
    windows: model.windows.map((w) => (w.id === targetId ? { ...w, offsetMm } : w)),
    doors: model.doors.map((d) => (d.id === targetId ? { ...d, offsetMm } : d)),
  };
}

function updateWidth(model: DrawingModel, targetId: string, widthMm: number): DrawingModel {
  return {
    ...model,
    windows: model.windows.map((w) => (w.id === targetId ? { ...w, widthMm } : w)),
    doors: model.doors.map((d) => (d.id === targetId ? { ...d, widthMm } : d)),
  };
}

function updateHeight(model: DrawingModel, targetId: string, heightMm: number): DrawingModel {
  return {
    ...model,
    windows: model.windows.map((w) => (w.id === targetId ? { ...w, heightMm } : w)),
    doors: model.doors.map((d) => (d.id === targetId ? { ...d, heightMm } : d)),
  };
}

function updateSillHeight(model: DrawingModel, targetId: string, sillHeightMm: number): DrawingModel {
  return {
    ...model,
    windows: model.windows.map((w) => (w.id === targetId ? { ...w, sillHeightMm } : w)),
  };
}

const FIELD_LABEL = {
  offsetMm: "Positionen",
  widthMm: "Bredden",
  heightMm: "Höjden",
  sillHeightMm: "Brösthöjden",
} as const;

function buildClampNote(field: keyof typeof FIELD_LABEL, requestedMm: number, appliedMm: number): string | null {
  const requested = Math.round(requestedMm);
  const applied = Math.round(appliedMm);
  if (requested === applied) return null;
  return `${FIELD_LABEL[field]} kunde inte bli ${requested}mm som begärt - den begränsades till ${applied}mm för att rymmas i ritningen.`;
}

export function applyRitEdit(model: DrawingModel, edit: ParsedRitEdit): ApplyRitEditResult {
  const element = findElement(model, edit.targetId);
  if (!element) {
    return { model, note: "Hittade inte längre det elementet i ritningen - inget ändrades." };
  }
  const wall = findWall(model, element.wallId);
  if (!wall) {
    return { model, note: "Hittade inte längre väggen det elementet sitter på - inget ändrades." };
  }

  if (edit.field === "offsetMm") {
    const requestedOffsetMm =
      edit.mode === "moveDirection"
        ? element.offsetMm + leftRightOffsetDeltaMm(edit.direction, edit.magnitudeMm)
        : edit.valueMm;
    const appliedOffsetMm = clampOffsetToWall(requestedOffsetMm, element.widthMm, wall);
    return {
      model: updateOffset(model, edit.targetId, appliedOffsetMm),
      note: buildClampNote("offsetMm", requestedOffsetMm, appliedOffsetMm),
    };
  }

  if (edit.field === "widthMm") {
    const requestedValueMm = edit.mode === "absolute" ? edit.valueMm : element.widthMm + edit.deltaMm;
    // Same discipline as placeWindowsEvenly (drawing-schema-from-answers.ts):
    // the wall's own remaining length from this element's (unchanged)
    // offset is a hard physical ceiling, never just a preference to clamp
    // toward - MIN_DIMENSION_MM only matters when it's below that ceiling.
    const spaceAvailableMm = Math.max(0, wallLengthMm(wall) - element.offsetMm);
    const minWidthMm = Math.min(MIN_DIMENSION_MM, spaceAvailableMm);
    const appliedWidthMm = clamp(requestedValueMm, minWidthMm, spaceAvailableMm);
    return {
      model: updateWidth(model, edit.targetId, appliedWidthMm),
      note: buildClampNote("widthMm", requestedValueMm, appliedWidthMm),
    };
  }

  if (edit.field === "heightMm") {
    const requestedValueMm = edit.mode === "absolute" ? edit.valueMm : element.heightMm + edit.deltaMm;
    const appliedHeightMm = Math.max(MIN_DIMENSION_MM, requestedValueMm);
    return {
      model: updateHeight(model, edit.targetId, appliedHeightMm),
      note: buildClampNote("heightMm", requestedValueMm, appliedHeightMm),
    };
  }

  // Only sillHeightMm remains - a door-only field doesn't exist (Door has
  // no sillHeightMm by definition, see drawing-schema.ts), so this is the
  // one case that needs the element to actually be a Window. NL-2's
  // validateEdit already blocks a door target from ever producing this
  // combination, but this function is meant to be safe standalone too.
  if (!isWindow(element)) {
    return { model, note: "Det elementet är en dörr och har ingen brösthöjd - inget ändrades." };
  }
  const requestedValueMm = edit.mode === "absolute" ? edit.valueMm : element.sillHeightMm + edit.deltaMm;
  // Floor of 0 (floor-to-ceiling is valid), no ceiling - nothing
  // elsewhere in this codebase models a ceiling height to check against
  // (see MIN_DIMENSION_MM's comment above).
  const appliedSillHeightMm = Math.max(0, requestedValueMm);
  return {
    model: updateSillHeight(model, edit.targetId, appliedSillHeightMm),
    note: buildClampNote("sillHeightMm", requestedValueMm, appliedSillHeightMm),
  };
}
