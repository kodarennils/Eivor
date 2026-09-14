import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyRitEdit } from "@/lib/apply-rit-edit";
import { SAMPLE_DRAWING_MODEL } from "@/lib/drawing-schema";
import type { ParsedRitEdit } from "@/lib/rit-edit";

// SAMPLE_DRAWING_MODEL (drawing-schema.ts): wall-norr/öster/söder length
// 6000/5000/6000/5000mm respectively. window-1 (wall-norr, offset 800,
// width 1200), window-2 (wall-norr, offset 4000, width 1000), window-3
// (wall-söder, offset 2500, width 1500, sill 1000), door-1 (wall-väster,
// offset 1500, width 900).

describe("applyRitEdit - offsetMm", () => {
  it("moves left (increasing offsetMm, per NL-1) within bounds - no clamp", () => {
    const edit: ParsedRitEdit = {
      targetId: "window-1",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "left",
      magnitudeMm: 500,
    };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.note, null);
    assert.equal(result.model.windows.find((w) => w.id === "window-1")?.offsetMm, 1300);
  });

  it("moves right (decreasing offsetMm) within bounds - no clamp", () => {
    const edit: ParsedRitEdit = {
      targetId: "window-1",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "right",
      magnitudeMm: 200,
    };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.note, null);
    assert.equal(result.model.windows.find((w) => w.id === "window-1")?.offsetMm, 600);
  });

  it("clamps a move that would push the element past the end of its wall, and explains it", () => {
    const edit: ParsedRitEdit = {
      targetId: "window-2",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "left",
      magnitudeMm: 2500,
    };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    // requested 4000+2500=6500, wall-norr length 6000, width 1000 -> max offset 5000
    assert.equal(result.model.windows.find((w) => w.id === "window-2")?.offsetMm, 5000);
    assert.match(result.note ?? "", /begränsades till 5000mm/);
  });

  it("clamps an absolute offset beyond the wall, and explains it", () => {
    const edit: ParsedRitEdit = { targetId: "window-1", field: "offsetMm", mode: "absolute", valueMm: 10000 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model.windows.find((w) => w.id === "window-1")?.offsetMm, 4800);
    assert.match(result.note ?? "", /begränsades till 4800mm/);
  });

  it("does not mutate the input model", () => {
    const before = JSON.parse(JSON.stringify(SAMPLE_DRAWING_MODEL));
    applyRitEdit(SAMPLE_DRAWING_MODEL, {
      targetId: "window-1",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "left",
      magnitudeMm: 500,
    });
    assert.deepEqual(SAMPLE_DRAWING_MODEL, before);
  });
});

describe("applyRitEdit - widthMm", () => {
  it("applies an absolute width within bounds - no clamp", () => {
    const edit: ParsedRitEdit = { targetId: "door-1", field: "widthMm", mode: "absolute", valueMm: 1000 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.note, null);
    assert.equal(result.model.doors.find((d) => d.id === "door-1")?.widthMm, 1000);
  });

  it("clamps an absolute width that would run the element off the wall, and explains it", () => {
    // wall-väster length 5000, door-1 offset 1500 -> space available 3500
    const edit: ParsedRitEdit = { targetId: "door-1", field: "widthMm", mode: "absolute", valueMm: 5000 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model.doors.find((d) => d.id === "door-1")?.widthMm, 3500);
    assert.match(result.note ?? "", /begränsades till 3500mm/);
  });

  it("floors a delta width that would go to zero/negative, and explains it", () => {
    const edit: ParsedRitEdit = { targetId: "window-3", field: "widthMm", mode: "delta", deltaMm: -2000 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    // requested 1500-2000=-500, floored to 100 (the MIN_DIMENSION_MM floor)
    assert.equal(result.model.windows.find((w) => w.id === "window-3")?.widthMm, 100);
    assert.match(result.note ?? "", /begränsades till 100mm/);
  });
});

describe("applyRitEdit - heightMm", () => {
  it("applies a delta height increase with no ceiling - no clamp", () => {
    const edit: ParsedRitEdit = { targetId: "window-1", field: "heightMm", mode: "delta", deltaMm: 300 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.note, null);
    assert.equal(result.model.windows.find((w) => w.id === "window-1")?.heightMm, 1700);
  });

  it("floors a delta height that would go to zero/negative, and explains it", () => {
    const edit: ParsedRitEdit = { targetId: "window-1", field: "heightMm", mode: "delta", deltaMm: -2000 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model.windows.find((w) => w.id === "window-1")?.heightMm, 100);
    assert.match(result.note ?? "", /begränsades till 100mm/);
  });
});

describe("applyRitEdit - sillHeightMm", () => {
  it("applies a delta increase with no ceiling - no clamp", () => {
    const edit: ParsedRitEdit = { targetId: "window-3", field: "sillHeightMm", mode: "delta", deltaMm: 500 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.note, null);
    assert.equal(result.model.windows.find((w) => w.id === "window-3")?.sillHeightMm, 1500);
  });

  it("floors a delta decrease at 0 (floor-to-ceiling is valid), and explains it", () => {
    const edit: ParsedRitEdit = { targetId: "window-3", field: "sillHeightMm", mode: "delta", deltaMm: -1500 };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model.windows.find((w) => w.id === "window-3")?.sillHeightMm, 0);
    assert.match(result.note ?? "", /begränsades till 0mm/);
  });

  it("refuses (no-op, with an explanatory note) when sillHeightMm targets a door", () => {
    const edit = {
      targetId: "door-1",
      field: "sillHeightMm",
      mode: "delta",
      deltaMm: -100,
    } as unknown as ParsedRitEdit;
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model, SAMPLE_DRAWING_MODEL);
    assert.match(result.note ?? "", /ingen brösthöjd/);
  });
});

describe("applyRitEdit - defensive fallbacks", () => {
  it("is a no-op with an explanatory note when targetId no longer exists", () => {
    const edit: ParsedRitEdit = {
      targetId: "window-99",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "left",
      magnitudeMm: 500,
    };
    const result = applyRitEdit(SAMPLE_DRAWING_MODEL, edit);
    assert.equal(result.model, SAMPLE_DRAWING_MODEL);
    assert.match(result.note ?? "", /Hittade inte/);
  });

  it("is a no-op with an explanatory note when the element's wall no longer exists", () => {
    const orphaned = {
      ...SAMPLE_DRAWING_MODEL,
      windows: SAMPLE_DRAWING_MODEL.windows.map((w) =>
        w.id === "window-1" ? { ...w, wallId: "wall-ghost" } : w,
      ),
    };
    const edit: ParsedRitEdit = {
      targetId: "window-1",
      field: "offsetMm",
      mode: "moveDirection",
      direction: "left",
      magnitudeMm: 500,
    };
    const result = applyRitEdit(orphaned, edit);
    assert.equal(result.model, orphaned);
    assert.match(result.note ?? "", /Hittade inte längre väggen/);
  });
});
