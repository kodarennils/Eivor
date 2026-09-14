import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  wallLengthMm,
  wallAngleRad,
  pointAlongWall,
  findWall,
  fitsOnWall,
  projectPointToWallOffsetMm,
  clampOffsetToWall,
  leftRightOffsetDeltaMm,
  SAMPLE_DRAWING_MODEL,
  REAL_CASE_DRAWING_MODEL,
  type Wall,
  type DrawingModel,
} from "./drawing-schema.ts";

const HORIZONTAL_WALL: Wall = { id: "w1", start: { xMm: 0, yMm: 0 }, end: { xMm: 6000, yMm: 0 } };
const VERTICAL_WALL: Wall = { id: "w2", start: { xMm: 0, yMm: 5000 }, end: { xMm: 0, yMm: 0 } };
const DIAGONAL_WALL: Wall = { id: "w3", start: { xMm: 0, yMm: 0 }, end: { xMm: 3000, yMm: 4000 } };

describe("wallLengthMm", () => {
  test("horizontal wall", () => {
    assert.equal(wallLengthMm(HORIZONTAL_WALL), 6000);
  });

  test("vertical wall", () => {
    assert.equal(wallLengthMm(VERTICAL_WALL), 5000);
  });

  test("diagonal wall (3-4-5 triangle)", () => {
    assert.equal(wallLengthMm(DIAGONAL_WALL), 5000);
  });

  test("zero-length wall (degenerate, start === end)", () => {
    assert.equal(wallLengthMm({ id: "w", start: { xMm: 1, yMm: 1 }, end: { xMm: 1, yMm: 1 } }), 0);
  });
});

describe("wallAngleRad", () => {
  test("horizontal wall (left to right) is 0 rad", () => {
    assert.equal(wallAngleRad(HORIZONTAL_WALL), 0);
  });

  test("vertical wall (bottom to top) is -90deg (-pi/2 rad)", () => {
    assert.ok(Math.abs(wallAngleRad(VERTICAL_WALL) - -Math.PI / 2) < 1e-9);
  });
});

describe("pointAlongWall", () => {
  test("offset 0 is the wall's start point", () => {
    assert.deepEqual(pointAlongWall(HORIZONTAL_WALL, 0), { xMm: 0, yMm: 0 });
  });

  test("offset equal to wall length is the wall's end point", () => {
    assert.deepEqual(pointAlongWall(HORIZONTAL_WALL, 6000), { xMm: 6000, yMm: 0 });
  });

  test("offset at the midpoint of a diagonal wall", () => {
    const mid = pointAlongWall(DIAGONAL_WALL, 2500);
    assert.ok(Math.abs(mid.xMm - 1500) < 1e-9);
    assert.ok(Math.abs(mid.yMm - 2000) < 1e-9);
  });

  test("degenerate zero-length wall doesn't divide by zero", () => {
    const zeroWall: Wall = { id: "z", start: { xMm: 5, yMm: 5 }, end: { xMm: 5, yMm: 5 } };
    assert.deepEqual(pointAlongWall(zeroWall, 100), { xMm: 5, yMm: 5 });
  });
});

describe("findWall", () => {
  test("finds a wall by id", () => {
    const wall = findWall(SAMPLE_DRAWING_MODEL, "wall-norr");
    assert.equal(wall?.id, "wall-norr");
  });

  test("returns undefined for an unknown id", () => {
    assert.equal(findWall(SAMPLE_DRAWING_MODEL, "wall-does-not-exist"), undefined);
  });
});

// The exact rule behind the "does this opening fit its wall" bug class
// found earlier this session - shared between generation-time validation
// (Phase C) and live drag clamping (Phase D).
describe("fitsOnWall", () => {
  test("fits comfortably within the wall", () => {
    assert.equal(fitsOnWall({ offsetMm: 800, widthMm: 1200 }, HORIZONTAL_WALL), true);
  });

  test("fits exactly flush against both ends", () => {
    assert.equal(fitsOnWall({ offsetMm: 0, widthMm: 6000 }, HORIZONTAL_WALL), true);
  });

  test("rejected when offset + width exceeds the wall length by even 1mm", () => {
    assert.equal(fitsOnWall({ offsetMm: 5000, widthMm: 1001 }, HORIZONTAL_WALL), false);
  });

  test("rejected when offset is negative", () => {
    assert.equal(fitsOnWall({ offsetMm: -100, widthMm: 500 }, HORIZONTAL_WALL), false);
  });

  test("rejected when width is zero or negative", () => {
    assert.equal(fitsOnWall({ offsetMm: 0, widthMm: 0 }, HORIZONTAL_WALL), false);
    assert.equal(fitsOnWall({ offsetMm: 0, widthMm: -50 }, HORIZONTAL_WALL), false);
  });
});

// Shared shape/consistency checks, run against both fixtures - the
// hardcoded sample (Phase B's minimum bar) and the real-dimensions
// fixture (Phase B's "verify against real data" bar).
function assertModelIsInternallyConsistent(model: DrawingModel, label: string) {
  const walls = model.walls;
  for (let i = 0; i < walls.length; i++) {
    const next = walls[(i + 1) % walls.length];
    assert.deepEqual(
      walls[i].end,
      next.start,
      `[${label}] wall ${walls[i].id} doesn't connect to ${next.id}`,
    );
  }
  for (const window of model.windows) {
    const wall = findWall(model, window.wallId);
    assert.ok(wall, `[${label}] window ${window.id} references an unknown wall ${window.wallId}`);
    assert.equal(
      fitsOnWall(window, wall!),
      true,
      `[${label}] window ${window.id} does not fit on wall ${window.wallId}`,
    );
  }
  for (const door of model.doors) {
    const wall = findWall(model, door.wallId);
    assert.ok(wall, `[${label}] door ${door.id} references an unknown wall ${door.wallId}`);
    assert.equal(
      fitsOnWall(door, wall!),
      true,
      `[${label}] door ${door.id} does not fit on wall ${door.wallId}`,
    );
  }
}

describe("SAMPLE_DRAWING_MODEL", () => {
  test("internally consistent: closed rectangle, every opening fits its wall", () => {
    assertModelIsInternallyConsistent(SAMPLE_DRAWING_MODEL, "SAMPLE_DRAWING_MODEL");
  });

  test("has at least two windows on the same wall at different offsets (per the requested sample shape)", () => {
    const onNorr = SAMPLE_DRAWING_MODEL.windows.filter((w) => w.wallId === "wall-norr");
    assert.ok(onNorr.length >= 2);
    assert.notEqual(onNorr[0].offsetMm, onNorr[1].offsetMm);
  });

  test("has at least one freehand-style structural element covered: one door present", () => {
    assert.ok(SAMPLE_DRAWING_MODEL.doors.length >= 1);
  });
});

// "Real data from an existing test case" per Phase B's own requirement -
// dimensions taken from the Nybyggnad walkthrough run earlier this
// session (10m x 8m, 6.5m to nock, windowsPerDirection
// norr:2/öster:1/söder:4/väster:2).
describe("REAL_CASE_DRAWING_MODEL", () => {
  test("internally consistent: closed rectangle, every opening fits its wall", () => {
    assertModelIsInternallyConsistent(REAL_CASE_DRAWING_MODEL, "REAL_CASE_DRAWING_MODEL");
  });

  test("matches the real test case's window counts per direction (norr:2/öster:1/söder:4/väster:2)", () => {
    const countOn = (wallId: string) =>
      REAL_CASE_DRAWING_MODEL.windows.filter((w) => w.wallId === wallId).length;
    assert.equal(countOn("wall-norr"), 2);
    assert.equal(countOn("wall-öster"), 1);
    assert.equal(countOn("wall-söder"), 4);
    assert.equal(countOn("wall-väster"), 2);
  });

  test("matches the real test case's overall dimensions (10m x 8m, 6.5m to nock)", () => {
    assert.equal(wallLengthMm(REAL_CASE_DRAWING_MODEL.walls[0]), 10000);
    assert.equal(wallLengthMm(REAL_CASE_DRAWING_MODEL.walls[1]), 8000);
    assert.equal(REAL_CASE_DRAWING_MODEL.roofRidgeHeightMm, 6500);
  });

  test("no two windows on the same wall overlap each other", () => {
    const byWall = new Map<string, typeof REAL_CASE_DRAWING_MODEL.windows>();
    for (const w of REAL_CASE_DRAWING_MODEL.windows) {
      byWall.set(w.wallId, [...(byWall.get(w.wallId) ?? []), w]);
    }
    for (const [wallId, windows] of byWall) {
      const sorted = [...windows].sort((a, b) => a.offsetMm - b.offsetMm);
      for (let i = 0; i < sorted.length - 1; i++) {
        const end = sorted[i].offsetMm + sorted[i].widthMm;
        assert.ok(
          end <= sorted[i + 1].offsetMm,
          `windows ${sorted[i].id} and ${sorted[i + 1].id} on ${wallId} overlap`,
        );
      }
    }
  });
});

// Phase D: the actual safety-critical math behind live drag clamping -
// verified here independently of Konva/React, since the drag GESTURE
// itself can only be checked by hand in a real browser, but the
// constraint math that gesture relies on is fully testable without one.
describe("projectPointToWallOffsetMm", () => {
  test("a point exactly on the wall projects to its true offset", () => {
    assert.equal(projectPointToWallOffsetMm(HORIZONTAL_WALL, { xMm: 2500, yMm: 0 }), 2500);
  });

  test("a point off the wall (perpendicular) still projects onto the wall's line", () => {
    // 500mm to the side of the 2500mm mark - perpendicular distance is
    // irrelevant to the projection, only position along the wall matters.
    assert.equal(projectPointToWallOffsetMm(HORIZONTAL_WALL, { xMm: 2500, yMm: 500 }), 2500);
  });

  test("a point beyond the wall's end projects past wallLength (unclamped - that's clampOffsetToWall's job)", () => {
    assert.equal(projectPointToWallOffsetMm(HORIZONTAL_WALL, { xMm: 9000, yMm: 0 }), 9000);
  });

  test("a point before the wall's start projects negative (unclamped)", () => {
    assert.equal(projectPointToWallOffsetMm(HORIZONTAL_WALL, { xMm: -500, yMm: 0 }), -500);
  });

  test("works on a diagonal wall too, not just axis-aligned ones", () => {
    const offset = projectPointToWallOffsetMm(DIAGONAL_WALL, { xMm: 1500, yMm: 2000 });
    assert.ok(Math.abs(offset - 2500) < 1e-9); // midpoint of a 5000mm wall
  });

  test("degenerate zero-length wall doesn't divide by zero", () => {
    const zeroWall: Wall = { id: "z", start: { xMm: 5, yMm: 5 }, end: { xMm: 5, yMm: 5 } };
    assert.equal(projectPointToWallOffsetMm(zeroWall, { xMm: 100, yMm: 100 }), 0);
  });
});

describe("clampOffsetToWall", () => {
  test("leaves an in-bounds offset unchanged", () => {
    assert.equal(clampOffsetToWall(2000, 1200, HORIZONTAL_WALL), 2000);
  });

  test("clamps a negative offset up to 0", () => {
    assert.equal(clampOffsetToWall(-500, 1200, HORIZONTAL_WALL), 0);
  });

  test("clamps an offset that would push the opening past the wall's end", () => {
    // 6000mm wall, 1200mm window: max valid offset is 4800.
    assert.equal(clampOffsetToWall(5500, 1200, HORIZONTAL_WALL), 4800);
  });

  test("the clamped result always satisfies fitsOnWall", () => {
    for (const attempted of [-10000, -1, 0, 1000, 5999, 6000, 50000]) {
      const clamped = clampOffsetToWall(attempted, 1200, HORIZONTAL_WALL);
      assert.equal(
        fitsOnWall({ offsetMm: clamped, widthMm: 1200 }, HORIZONTAL_WALL),
        true,
        `attempted=${attempted} clamped=${clamped} does not satisfy fitsOnWall`,
      );
    }
  });

  test("a wall shorter than the opening clamps to 0 rather than going negative", () => {
    const tinyWall: Wall = { id: "t", start: { xMm: 0, yMm: 0 }, end: { xMm: 500, yMm: 0 } };
    assert.equal(clampOffsetToWall(9999, 1200, tinyWall), 0);
  });
});

// NL-1: locks in the verified viewer-relative left/right convention
// (see the derivation in drawing-schema.ts) - "left" is easy to get
// backward here (a viewer facing into the building reads a north-up
// plan mirrored relative to how it's normally read), so this exists
// specifically so a future refactor can't silently flip the sign
// without a test failing.
describe("leftRightOffsetDeltaMm (NL-1)", () => {
  test("left produces a positive delta (increasing offsetMm)", () => {
    assert.equal(leftRightOffsetDeltaMm("left", 500), 500);
  });

  test("right produces a negative delta (decreasing offsetMm)", () => {
    assert.equal(leftRightOffsetDeltaMm("right", 500), -500);
  });

  test("zero magnitude is a no-op regardless of direction", () => {
    assert.equal(leftRightOffsetDeltaMm("left", 0), 0);
    assert.equal(leftRightOffsetDeltaMm("right", 0), 0);
  });

  // Ties the abstract sign convention back to concrete geometry, rather
  // than trusting the sign in isolation: moving "left" a window on
  // wall-norr should move it toward the east (öster) corner - larger
  // xMm - since wall-norr's offsetMm runs west->east and the derivation
  // says left = increasing offset on every wall.
  test("applied to a real window on wall-norr, 'left' moves it toward increasing offset (east)", () => {
    const wall = SAMPLE_DRAWING_MODEL.walls.find((w) => w.id === "wall-norr")!;
    const window = SAMPLE_DRAWING_MODEL.windows.find((w) => w.wallId === "wall-norr")!;
    const beforeX = pointAlongWall(wall, window.offsetMm).xMm;
    const movedOffsetMm = window.offsetMm + leftRightOffsetDeltaMm("left", 500);
    const afterX = pointAlongWall(wall, movedOffsetMm).xMm;
    assert.ok(afterX > beforeX, "expected 'left' to move the window toward larger xMm (east) on wall-norr");
  });

  // Same check on wall-söder (offsetMm runs east->west, the opposite
  // traversal direction of wall-norr) - if the convention were
  // accidentally wall-specific instead of universal, this is where it
  // would show up: "left" should still increase offsetMm, but that now
  // means moving toward smaller xMm (west) instead of larger.
  test("on wall-söder (opposite traversal direction to wall-norr), 'left' still means increasing offset", () => {
    const wall = SAMPLE_DRAWING_MODEL.walls.find((w) => w.id === "wall-söder")!;
    const window = SAMPLE_DRAWING_MODEL.windows.find((w) => w.wallId === "wall-söder")!;
    const beforeX = pointAlongWall(wall, window.offsetMm).xMm;
    const movedOffsetMm = window.offsetMm + leftRightOffsetDeltaMm("left", 500);
    const afterX = pointAlongWall(wall, movedOffsetMm).xMm;
    assert.ok(afterX < beforeX, "expected 'left' on wall-söder to move toward smaller xMm (west), since söder's offset runs east->west");
  });
});
