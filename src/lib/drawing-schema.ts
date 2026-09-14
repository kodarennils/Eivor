// Structured, typed replacement for the "pure function returns an SVG
// string" approach used by lib/drawing.ts, facade-drawing.ts, etc.
// Both generation (Phase C, not yet wired up) and editing (Phase D, not
// yet built) read from and write to this shape - it's the source of
// truth. SVG/PDF export (Phase E) will just be one more thing that reads
// from it, same as the Konva renderer below.
//
// Deliberately minimal for this phase: a single ridgeHeightMm is enough
// to represent the simple single-story volumes this system currently
// handles (see lib/drawing.ts, lib/facade-drawing.ts). Multi-floor/roof-
// type modeling is left out until a real need for it shows up - adding
// an optional floorId to Wall later is a small change, building it in
// now speculatively is not worth the complexity for what exists today.

export type Point2D = { xMm: number; yMm: number };

export type Wall = {
  id: string;
  start: Point2D;
  end: Point2D;
};

export type Window = {
  id: string;
  wallId: string;
  offsetMm: number; // distance from the wall's start point, along the wall
  widthMm: number;
  heightMm: number;
  sillHeightMm: number; // height from floor to bottom of window
};

// Same shape as Window (offset/width/height along a wall) minus
// sillHeight, since a door starts at the floor by definition.
export type Door = {
  id: string;
  wallId: string;
  offsetMm: number;
  widthMm: number;
  heightMm: number;
};

export type DrawingModel = {
  walls: Wall[];
  windows: Window[];
  doors: Door[];
  roofRidgeHeightMm: number;
};

// --- Geometry ---------------------------------------------------------

export function wallLengthMm(wall: Wall): number {
  return Math.hypot(wall.end.xMm - wall.start.xMm, wall.end.yMm - wall.start.yMm);
}

export function wallAngleRad(wall: Wall): number {
  return Math.atan2(wall.end.yMm - wall.start.yMm, wall.end.xMm - wall.start.xMm);
}

// The real-world point offsetMm along a wall from its start, in the same
// mm coordinate space the wall's own start/end are defined in.
export function pointAlongWall(wall: Wall, offsetMm: number): Point2D {
  const length = wallLengthMm(wall);
  const t = length === 0 ? 0 : offsetMm / length;
  return {
    xMm: wall.start.xMm + (wall.end.xMm - wall.start.xMm) * t,
    yMm: wall.start.yMm + (wall.end.yMm - wall.start.yMm) * t,
  };
}

export function findWall(model: DrawingModel, wallId: string): Wall | undefined {
  return model.walls.find((w) => w.id === wallId);
}

// --- Validation ---------------------------------------------------------
// The exact rule behind the comma-decimal/measurement bugs found earlier
// this session: an opening that doesn't fit within its wall. Shared here
// so generation-time validation (Phase C) and live drag-time clamping
// (Phase D) read from one definition and can never disagree about what
// counts as a valid position - same principle as checkDrawingReadiness()
// being shared between the interview route and /api/projekt/ritning.
export function fitsOnWall(item: { offsetMm: number; widthMm: number }, wall: Wall): boolean {
  return item.offsetMm >= 0 && item.widthMm > 0 && item.offsetMm + item.widthMm <= wallLengthMm(wall);
}

// --- Phase D: live drag support ------------------------------------------
// Projects an arbitrary point (in the same mm coordinate space as the
// wall's own start/end - NOT stage/pixel space, callers convert) onto
// the wall's infinite line, via a standard vector projection (dot
// product over length-squared). The result can fall outside [0,
// wallLength] - that's intentional, so clampOffsetToWall() alone decides
// what's valid, keeping one definition of "in bounds" instead of two.
export function projectPointToWallOffsetMm(wall: Wall, point: Point2D): number {
  const length = wallLengthMm(wall);
  if (length === 0) return 0;
  const dx = wall.end.xMm - wall.start.xMm;
  const dy = wall.end.yMm - wall.start.yMm;
  const px = point.xMm - wall.start.xMm;
  const py = point.yMm - wall.start.yMm;
  const t = (px * dx + py * dy) / (length * length);
  return t * length;
}

// Clamps a proposed offsetMm so an opening of the given width stays
// fully within the wall - the exact constraint fitsOnWall() checks
// pass/fail, now usable live (during a drag gesture) instead of only as
// an after-the-fact validation. For a wall shorter than the opening
// itself (a degenerate/invalid case that shouldn't arise from valid
// data), this returns 0 rather than a negative offset.
export function clampOffsetToWall(offsetMm: number, widthMm: number, wall: Wall): number {
  const length = wallLengthMm(wall);
  const maxOffset = Math.max(0, length - widthMm);
  return Math.min(Math.max(offsetMm, 0), maxOffset);
}

// --- Hardcoded sample for Phase A/B verification -----------------------
// A simple rectangular single-story building, 6000mm x 5000mm (matching
// the scale of the Tillbyggnad/Attefallshus test cases used elsewhere in
// this session), walls id'd by compass direction to match the Direction
// convention used throughout the rest of the codebase (lib/project-fields.ts).
// Walls trace the rectangle clockwise so consecutive walls share an
// endpoint. Two windows on wall-norr at different offsets, one on
// wall-söder, one door on wall-väster - all independently checked
// against fitsOnWall() in drawing-schema.test.ts.
export const SAMPLE_DRAWING_MODEL: DrawingModel = {
  walls: [
    { id: "wall-norr", start: { xMm: 0, yMm: 0 }, end: { xMm: 6000, yMm: 0 } },
    { id: "wall-öster", start: { xMm: 6000, yMm: 0 }, end: { xMm: 6000, yMm: 5000 } },
    { id: "wall-söder", start: { xMm: 6000, yMm: 5000 }, end: { xMm: 0, yMm: 5000 } },
    { id: "wall-väster", start: { xMm: 0, yMm: 5000 }, end: { xMm: 0, yMm: 0 } },
  ],
  windows: [
    {
      id: "window-1",
      wallId: "wall-norr",
      offsetMm: 800,
      widthMm: 1200,
      heightMm: 1400,
      sillHeightMm: 900,
    },
    {
      id: "window-2",
      wallId: "wall-norr",
      offsetMm: 4000,
      widthMm: 1000,
      heightMm: 1400,
      sillHeightMm: 900,
    },
    {
      id: "window-3",
      wallId: "wall-söder",
      offsetMm: 2500,
      widthMm: 1500,
      heightMm: 1200,
      sillHeightMm: 1000,
    },
  ],
  doors: [{ id: "door-1", wallId: "wall-väster", offsetMm: 1500, widthMm: 900, heightMm: 2000 }],
  roofRidgeHeightMm: 3500,
};

// Second verification fixture using real dimensions from the Nybyggnad
// walkthrough run earlier this session (10m x 8m, 6.5m to nock,
// windowsPerDirection norr:2/öster:1/söder:4/väster:2) - "real data from
// an existing test case" per Phase B's own requirement.
//
// Window positions here are HAND-PLACED to roughly match those counts,
// not derived by an algorithm - today's data model only has per-wall
// window COUNTS (windowsPerDirection), not positions, so there is no
// real conversion to test yet. Deciding how to turn a count into actual
// offsets (evenly spaced? something else?) is Phase C's job, not
// pre-empted here.
export const REAL_CASE_DRAWING_MODEL: DrawingModel = {
  walls: [
    { id: "wall-norr", start: { xMm: 0, yMm: 0 }, end: { xMm: 10000, yMm: 0 } },
    { id: "wall-öster", start: { xMm: 10000, yMm: 0 }, end: { xMm: 10000, yMm: 8000 } },
    { id: "wall-söder", start: { xMm: 10000, yMm: 8000 }, end: { xMm: 0, yMm: 8000 } },
    { id: "wall-väster", start: { xMm: 0, yMm: 8000 }, end: { xMm: 0, yMm: 0 } },
  ],
  windows: [
    { id: "norr-1", wallId: "wall-norr", offsetMm: 1500, widthMm: 1200, heightMm: 1200, sillHeightMm: 1000 },
    { id: "norr-2", wallId: "wall-norr", offsetMm: 7000, widthMm: 1200, heightMm: 1200, sillHeightMm: 1000 },
    { id: "öster-1", wallId: "wall-öster", offsetMm: 3500, widthMm: 1000, heightMm: 1200, sillHeightMm: 1000 },
    { id: "söder-1", wallId: "wall-söder", offsetMm: 1000, widthMm: 1500, heightMm: 1500, sillHeightMm: 800 },
    { id: "söder-2", wallId: "wall-söder", offsetMm: 3200, widthMm: 1500, heightMm: 1500, sillHeightMm: 800 },
    { id: "söder-3", wallId: "wall-söder", offsetMm: 5400, widthMm: 1500, heightMm: 1500, sillHeightMm: 800 },
    { id: "söder-4", wallId: "wall-söder", offsetMm: 7600, widthMm: 1500, heightMm: 1500, sillHeightMm: 800 },
    { id: "väster-1", wallId: "wall-väster", offsetMm: 2500, widthMm: 1000, heightMm: 1200, sillHeightMm: 1000 },
    { id: "väster-2", wallId: "wall-väster", offsetMm: 5500, widthMm: 1000, heightMm: 1200, sillHeightMm: 1000 },
  ],
  doors: [{ id: "door-1", wallId: "wall-norr", offsetMm: 4200, widthMm: 1000, heightMm: 2100 }],
  roofRidgeHeightMm: 6500,
};

// --- NL-1: viewer-relative left/right for natural-language edits --------
// Derived (not guessed) from this codebase's actual wall tracing order -
// see buildWallsFromDimensions() in drawing-schema-from-answers.ts, which
// traces norr -> öster -> söder -> väster, each wall's end meeting the
// next wall's start (NW -> NE -> SE -> SW -> NW: CLOCKWISE on a north-up
// plan, confirmed against the existing northArrow() SVG helper elsewhere
// in this codebase, which points toward -y, i.e. "up" on screen).
//
// For ANY clockwise-traced boundary, walking along it in the direction
// of increasing parameter keeps the interior on your right. A viewer
// standing outside a wall, facing INTO the building, is oriented 90
// degrees clockwise from that walking direction - which puts their LEFT
// hand pointing the same way the walking direction does, i.e. the same
// way offsetMm increases. This falls out of the tracing direction alone
// and holds identically for all four walls - concretely, for wall-norr
// (offsetMm running west->east): a viewer standing north of it, facing
// south into the building, has east on their left. East is the
// direction offsetMm increases on that wall. Verified two more ways (an
// explicit 180-degree-turn argument, and the standard compass mnemonic
// "facing south, east is left") before relying on it - see the
// conversation this was derived in for the full walkthrough.
//
// Deliberately takes no wallId: unlike offsetMm itself (which is
// wall-specific), the LEFT/RIGHT relationship to it is not - the
// uniform result above is the interesting/easy-to-get-backward part,
// not a per-wall lookup table.
export function leftRightOffsetDeltaMm(direction: "left" | "right", magnitudeMm: number): number {
  // The `|| 0` normalizes -0 (produced by negating a zero magnitude for
  // "right") to a plain 0 - "no movement" should be unambiguous rather
  // than occasionally -0 depending on which direction a zero came with.
  return (direction === "left" ? magnitudeMm : -magnitudeMm) || 0;
}
