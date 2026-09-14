import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fitsOnWall, wallLengthMm, type Wall } from "./drawing-schema.ts";
import {
  placeWindowsEvenly,
  buildWallsFromDimensions,
  buildDrawingModelFromAnswers,
} from "./drawing-schema-from-answers.ts";

const WALL_6000: Wall = { id: "w", start: { xMm: 0, yMm: 0 }, end: { xMm: 6000, yMm: 0 } };

describe("placeWindowsEvenly", () => {
  test("zero count returns an empty array", () => {
    assert.deepEqual(placeWindowsEvenly(WALL_6000, "w", 0, "win"), []);
  });

  test("one window is roughly centered on the wall", () => {
    const [win] = placeWindowsEvenly(WALL_6000, "w", 1, "win");
    const center = win.offsetMm + win.widthMm / 2;
    assert.ok(Math.abs(center - 3000) < 50, `expected centered near 3000, got ${center}`);
  });

  test("windows are returned in left-to-right offset order", () => {
    const windows = placeWindowsEvenly(WALL_6000, "w", 3, "win");
    for (let i = 0; i < windows.length - 1; i++) {
      assert.ok(windows[i].offsetMm < windows[i + 1].offsetMm);
    }
  });

  test("every generated window individually fits the wall", () => {
    const windows = placeWindowsEvenly(WALL_6000, "w", 4, "win");
    for (const win of windows) {
      assert.equal(fitsOnWall(win, WALL_6000), true, `${win.id} does not fit`);
    }
  });

  test("no two windows on the same wall overlap", () => {
    const windows = placeWindowsEvenly(WALL_6000, "w", 4, "win");
    for (let i = 0; i < windows.length - 1; i++) {
      const end = windows[i].offsetMm + windows[i].widthMm;
      assert.ok(end <= windows[i + 1].offsetMm, `${windows[i].id} overlaps ${windows[i + 1].id}`);
    }
  });

  test("shrinks window width rather than overlap when the wall is short relative to the count", () => {
    const shortWall: Wall = { id: "s", start: { xMm: 0, yMm: 0 }, end: { xMm: 2000, yMm: 0 } };
    const windows = placeWindowsEvenly(shortWall, "s", 4, "win");
    for (const win of windows) {
      assert.equal(fitsOnWall(win, shortWall), true, `${win.id} does not fit the short wall`);
      assert.ok(win.widthMm < 1200, "expected width to shrink below the default");
    }
  });

  // Property-style coverage across a wide range of wall lengths and
  // counts, not just a couple of spot-checked examples - this is where a
  // clamping/rounding bug would most likely hide.
  test("property: for every wall length 1000-20000mm and count 1-10, every window fits and none overlap", () => {
    for (let length = 1000; length <= 20000; length += 1000) {
      const wall: Wall = { id: "p", start: { xMm: 0, yMm: 0 }, end: { xMm: length, yMm: 0 } };
      for (let count = 1; count <= 10; count++) {
        const windows = placeWindowsEvenly(wall, "p", count, "win");
        assert.equal(windows.length, count, `length=${length} count=${count}: wrong window count`);
        for (const win of windows) {
          assert.equal(
            fitsOnWall(win, wall),
            true,
            `length=${length} count=${count}: ${win.id} (offset=${win.offsetMm}, width=${win.widthMm}) does not fit`,
          );
        }
        for (let i = 0; i < windows.length - 1; i++) {
          const end = windows[i].offsetMm + windows[i].widthMm;
          assert.ok(
            end <= windows[i + 1].offsetMm,
            `length=${length} count=${count}: window ${i} overlaps window ${i + 1}`,
          );
        }
      }
    }
  });

  test("degenerate zero-length wall never divides by zero or produces NaN", () => {
    const zeroWall: Wall = { id: "z", start: { xMm: 5, yMm: 5 }, end: { xMm: 5, yMm: 5 } };
    const windows = placeWindowsEvenly(zeroWall, "z", 3, "win");
    assert.deepEqual(windows, []);
  });

  // The exact case that broke the earlier (min-width-floor) version of
  // this function: count * a fixed minimum width exceeded the wall
  // length, and offset clamping silently let two windows overlap.
  test("regression: 2 windows on a 1000mm wall never overlap, however narrow they end up", () => {
    const tinyWall: Wall = { id: "t", start: { xMm: 0, yMm: 0 }, end: { xMm: 1000, yMm: 0 } };
    const windows = placeWindowsEvenly(tinyWall, "t", 2, "win");
    assert.equal(fitsOnWall(windows[0], tinyWall), true);
    assert.equal(fitsOnWall(windows[1], tinyWall), true);
    assert.ok(windows[0].offsetMm + windows[0].widthMm <= windows[1].offsetMm);
  });

  // Pushed further than the main property sweep: a genuinely absurd
  // ratio (10 windows on a 100mm wall) to confirm the slot-based
  // approach has no remaining failure mode at the extreme, not just
  // within the range already swept above.
  test("property (extreme): even 10 windows on a 100mm wall never overlap or exceed the wall", () => {
    const extremeWall: Wall = { id: "e", start: { xMm: 0, yMm: 0 }, end: { xMm: 100, yMm: 0 } };
    const windows = placeWindowsEvenly(extremeWall, "e", 10, "win");
    assert.equal(windows.length, 10);
    for (const win of windows) {
      assert.equal(fitsOnWall(win, extremeWall), true, `${win.id} does not fit`);
    }
    for (let i = 0; i < windows.length - 1; i++) {
      const end = windows[i].offsetMm + windows[i].widthMm;
      assert.ok(end <= windows[i + 1].offsetMm, `window ${i} overlaps window ${i + 1}`);
    }
  });
});

describe("buildWallsFromDimensions", () => {
  test("produces a closed rectangle matching the requested width/depth", () => {
    const walls = buildWallsFromDimensions(6000, 5000);
    assert.equal(wallLengthMm(walls[0]), 6000); // norr
    assert.equal(wallLengthMm(walls[1]), 5000); // öster
    assert.equal(wallLengthMm(walls[2]), 6000); // söder
    assert.equal(wallLengthMm(walls[3]), 5000); // väster
    for (let i = 0; i < walls.length; i++) {
      const next = walls[(i + 1) % walls.length];
      assert.deepEqual(walls[i].end, next.start);
    }
  });
});

describe("buildDrawingModelFromAnswers", () => {
  test("returns null when the hard minimum (width/depth/height) isn't present - same bar as checkDrawingReadiness", () => {
    assert.equal(buildDrawingModelFromAnswers({}), null);
    assert.equal(buildDrawingModelFromAnswers({ widthMeters: "6", depthMeters: "5" }), null);
  });

  test("builds a valid model from a complete real-shaped answers object", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "10",
      depthMeters: "8",
      heightMeters: "6,5", // Swedish comma-decimal, matching real interview output
      windowsPerDirection: { norr: "2", öster: "1", söder: "4", väster: "2" },
      mainEntranceDirection: "norr",
    });
    assert.ok(model);
    assert.equal(model!.roofRidgeHeightMm, 6500);
    assert.equal(wallLengthMm(model!.walls[0]), 10000);
    assert.equal(wallLengthMm(model!.walls[1]), 8000);
  });

  test("window counts per direction match windowsPerDirection exactly", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "10",
      depthMeters: "8",
      heightMeters: "6.5",
      windowsPerDirection: { norr: "2", öster: "1", söder: "4", väster: "2" },
    });
    const countOn = (wallId: string) => model!.windows.filter((w) => w.wallId === wallId).length;
    assert.equal(countOn("wall-norr"), 2);
    assert.equal(countOn("wall-öster"), 1);
    assert.equal(countOn("wall-söder"), 4);
    assert.equal(countOn("wall-väster"), 2);
  });

  test("a direction missing from windowsPerDirection gets zero windows, not an error", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
      windowsPerDirection: { norr: "2" },
    });
    assert.equal(model!.windows.filter((w) => w.wallId === "wall-söder").length, 0);
  });

  test("places a door on the main entrance wall, centered", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
      mainEntranceDirection: "söder",
    });
    assert.equal(model!.doors.length, 1);
    assert.equal(model!.doors[0].wallId, "wall-söder");
    const wall = model!.walls.find((w) => w.id === "wall-söder")!;
    assert.equal(fitsOnWall(model!.doors[0], wall), true);
  });

  // Live-observed bug: a real interview run produced mainEntranceDirection:
  // "Söder" (capitalized - a completely normal way to write it in
  // Swedish, and the prompt never specifies casing), which the original
  // exact-match check against DIRECTIONS' lowercase values silently
  // failed, placing zero doors despite the data being present.
  // Casing normalization used to live here (a local .toLowerCase()
  // workaround) but has since moved upstream: mainEntranceDirection is
  // now one of interview.ts's ENUM_FIELDS, so parseInterviewMessage
  // normalizes casing before this function ever sees the value - see
  // interview.test.ts's "mainEntranceDirection: accepts a casing
  // variant..." test for that coverage. This function now trusts its
  // input is already canonical, matching how every other answers field
  // already worked.
  test("places a door given an already-canonical (lowercase) mainEntranceDirection", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
      mainEntranceDirection: "söder",
    });
    assert.equal(model!.doors.length, 1);
    assert.equal(model!.doors[0].wallId, "wall-söder");
  });

  test("a non-canonical-cased mainEntranceDirection is no longer normalized here (that's interview.ts's job now)", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
      mainEntranceDirection: "Söder",
    });
    assert.equal(model!.doors.length, 0);
  });

  test("no door is placed when mainEntranceDirection is unknown/missing", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
    });
    assert.equal(model!.doors.length, 0);
  });

  test("every window and door in the final model fits its wall (end-to-end check)", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "10",
      depthMeters: "8",
      heightMeters: "6.5",
      windowsPerDirection: { norr: "2", öster: "1", söder: "4", väster: "2" },
      mainEntranceDirection: "norr",
    });
    for (const opening of [...model!.windows, ...model!.doors]) {
      const wall = model!.walls.find((w) => w.id === opening.wallId)!;
      assert.equal(fitsOnWall(opening, wall), true, `${opening.id} does not fit`);
    }
  });

  test("a garbled/non-numeric window count is treated as zero, not NaN or an error", () => {
    const model = buildDrawingModelFromAnswers({
      widthMeters: "6",
      depthMeters: "5",
      heightMeters: "3.5",
      windowsPerDirection: { norr: "några" },
    });
    assert.equal(model!.windows.filter((w) => w.wallId === "wall-norr").length, 0);
  });
});
