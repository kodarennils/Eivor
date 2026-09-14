// Phase C: converts the flat, LLM-collected `answers` shape (the same
// project_answers row the interview/document panel/review screen all
// read and write - see lib/interview.ts) into a structured DrawingModel.
//
// The real design problem flagged during Phase A/B: windowsPerDirection
// is a per-wall COUNT only (e.g. "2 windows facing norr") - no position,
// size, or sill height is collected anywhere today. Rather than adding a
// new, more granular interview question (a bigger, separate change),
// this implements a reasonable deterministic default: evenly space
// standard-size windows along the wall. Phase D's dragging is what lets
// a user move away from this default - nothing here is meant to be
// final, only a valid, sensible starting point.

import {
  type DrawingModel,
  type Wall,
  type Window,
  type Door,
  wallLengthMm,
  fitsOnWall,
} from "@/lib/drawing-schema";
import { DIRECTIONS, type Direction } from "@/lib/project-fields";
import { parseSwedishNumber } from "@/lib/swedish-number";

const DEFAULT_WINDOW_WIDTH_MM = 1200;
const DEFAULT_WINDOW_HEIGHT_MM = 1200;
const DEFAULT_WINDOW_SILL_HEIGHT_MM = 900;
const WINDOW_GAP_MM = 200; // preferred breathing room around each window, within its slot

const DEFAULT_DOOR_WIDTH_MM = 900;
const DEFAULT_DOOR_HEIGHT_MM = 2100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// A count parsed from free-typed/LLM-extracted text that isn't a valid
// non-negative number (missing, unparseable, negative) is treated as
// "no windows on this wall" rather than propagating NaN through the
// placement math.
function parseCount(value: unknown): number {
  const parsed = parseSwedishNumber(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

// Evenly spaces `count` windows along `wall`. Each window gets an equal
// slot of the wall (wallLength / count) first - that alone guarantees no
// overlap and fitsOnWall for ANY count/wallLength combination, including
// pathological ones (many windows on a short wall). The default width +
// gap is then used only to size the window WITHIN its own slot, never
// wider than the slot itself, so it can never encroach on a neighbor.
//
// An earlier version tried to clamp width up to a fixed minimum (600mm)
// first and fit offsets afterward - that produced actual overlapping
// windows once count * minimum exceeded the wall length (caught by the
// property test below, at e.g. 2 windows on a 1000mm wall). Slot-first
// sizing can't have that failure mode: width is always derived FROM the
// slot, never imposed independently of it.
export function placeWindowsEvenly(
  wall: Wall,
  wallId: string,
  count: number,
  idPrefix: string,
): Window[] {
  if (count <= 0) return [];
  const wallLength = wallLengthMm(wall);
  if (wallLength <= 0) return [];

  const slotMm = wallLength / count;
  const desiredWidthMm = Math.min(DEFAULT_WINDOW_WIDTH_MM, Math.max(1, slotMm - WINDOW_GAP_MM));
  const widthMm = Math.max(1, Math.min(desiredWidthMm, slotMm));

  return Array.from({ length: count }, (_, i) => {
    const slotStart = slotMm * i;
    const offsetMm = clamp(
      Math.round(slotStart + (slotMm - widthMm) / 2), // centered within its own slot
      slotStart,
      slotStart + slotMm - widthMm,
    );
    return {
      id: `${idPrefix}-${i + 1}`,
      wallId,
      offsetMm: Math.max(0, Math.min(offsetMm, wallLength - widthMm)),
      widthMm: Math.round(widthMm),
      heightMm: DEFAULT_WINDOW_HEIGHT_MM,
      sillHeightMm: DEFAULT_WINDOW_SILL_HEIGHT_MM,
    };
  });
}

// Builds the four perimeter walls from overall width/depth, matching the
// same clockwise-rectangle convention already used by the fixtures in
// drawing-schema.ts (norr/öster/söder/väster, each wall's end meeting
// the next wall's start).
export function buildWallsFromDimensions(widthMm: number, depthMm: number): Wall[] {
  return [
    { id: "wall-norr", start: { xMm: 0, yMm: 0 }, end: { xMm: widthMm, yMm: 0 } },
    { id: "wall-öster", start: { xMm: widthMm, yMm: 0 }, end: { xMm: widthMm, yMm: depthMm } },
    { id: "wall-söder", start: { xMm: widthMm, yMm: depthMm }, end: { xMm: 0, yMm: depthMm } },
    { id: "wall-väster", start: { xMm: 0, yMm: depthMm }, end: { xMm: 0, yMm: 0 } },
  ];
}

// The real Phase C entry point: same `answers` shape the interview/
// document panel/review screen already read and write. Returns null if
// the hard minimum (width/depth/height) isn't present yet - the exact
// same bar as checkDrawingReadiness() in lib/interview.ts, so "can we
// build a drawing model" and "can /api/projekt/ritning actually
// generate" never disagree with each other.
export function buildDrawingModelFromAnswers(answers: Record<string, unknown>): DrawingModel | null {
  const widthMm = parseSwedishNumber(answers.widthMeters) * 1000;
  const depthMm = parseSwedishNumber(answers.depthMeters) * 1000;
  const heightMm = parseSwedishNumber(answers.heightMeters) * 1000;
  if (!widthMm || !depthMm || !heightMm) return null;

  const walls = buildWallsFromDimensions(widthMm, depthMm);
  const windowsPerDirection = (answers.windowsPerDirection ?? {}) as Partial<Record<Direction, string>>;

  const windows: Window[] = DIRECTIONS.flatMap((direction) => {
    const wall = walls.find((w) => w.id === `wall-${direction}`);
    if (!wall) return [];
    const count = parseCount(windowsPerDirection[direction]);
    return placeWindowsEvenly(wall, wall.id, count, `${direction}-win`);
  });

  const doors: Door[] = [];
  // mainEntranceDirection is one of interview.ts's ENUM_FIELDS now (a
  // case-insensitively matched, canonical-casing-normalized value at
  // extraction time) - this can trust it's already exactly one of
  // DIRECTIONS' values, or absent. See interview.ts for the live-
  // observed casing bug ("Söder" vs "söder") that used to require a
  // local .toLowerCase() workaround here.
  const mainEntranceDirection = answers.mainEntranceDirection as string | undefined;
  if (DIRECTIONS.includes(mainEntranceDirection as Direction)) {
    const wall = walls.find((w) => w.id === `wall-${mainEntranceDirection}`);
    if (wall) {
      const wallLength = wallLengthMm(wall);
      const doorWidth = Math.min(DEFAULT_DOOR_WIDTH_MM, wallLength);
      doors.push({
        id: "main-entrance",
        wallId: wall.id,
        offsetMm: clamp(
          Math.round((wallLength - doorWidth) / 2),
          0,
          Math.max(0, wallLength - doorWidth),
        ),
        widthMm: Math.round(doorWidth),
        heightMm: DEFAULT_DOOR_HEIGHT_MM,
      });
    }
  }

  // Same discipline as the rest of this session's gates (checkDrawingReadiness,
  // fitsOnWall shared between generation and drag-clamping): don't just
  // trust the placement math, verify its own output before handing it
  // back. Should never actually fire given how placeWindowsEvenly/the
  // door offset are constructed, but if it ever does, better a loud
  // console.error during development than a silently invalid model.
  for (const opening of [...windows, ...doors]) {
    const wall = walls.find((w) => w.id === opening.wallId);
    if (!wall || !fitsOnWall(opening, wall)) {
      console.error(
        `buildDrawingModelFromAnswers: generated opening ${opening.id} does not fit its wall - this indicates a bug in the placement algorithm, not the input data`,
        opening,
      );
    }
  }

  return { walls, windows, doors, roofRidgeHeightMm: heightMm };
}
