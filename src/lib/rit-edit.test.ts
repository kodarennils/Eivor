import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeDrawingModelForPrompt,
  parseRitEditResponse,
  isValidDrawingModel,
} from "@/lib/rit-edit";
import { SAMPLE_DRAWING_MODEL } from "@/lib/drawing-schema";

// SAMPLE_DRAWING_MODEL: window-1 + window-2 on wall-norr, window-3 on
// wall-söder, door-1 on wall-väster - see drawing-schema.ts.

function block(obj: unknown): string {
  return "```json\n" + JSON.stringify(obj) + "\n```";
}

describe("describeDrawingModelForPrompt", () => {
  it("numbers windows that share a wall, but not ones alone on their wall", () => {
    const text = describeDrawingModelForPrompt(SAMPLE_DRAWING_MODEL);
    assert.match(text, /id="window-1".*\(fönster 1 av 2 på den väggen\)/);
    assert.match(text, /id="window-2".*\(fönster 2 av 2 på den väggen\)/);
    assert.doesNotMatch(text.split("\n").find((l) => l.includes("window-3")) ?? "", /fönster \d av \d/);
  });

  it("includes doors with their wall's Swedish direction label", () => {
    const text = describeDrawingModelForPrompt(SAMPLE_DRAWING_MODEL);
    assert.match(text, /id="door-1": dörr på vägg Väster/);
  });

  it("reports no elements when the model has none", () => {
    const empty = { ...SAMPLE_DRAWING_MODEL, windows: [], doors: [] };
    assert.equal(describeDrawingModelForPrompt(empty), "(inga fönster eller dörrar i ritningen än)");
  });
});

describe("isValidDrawingModel", () => {
  it("accepts the real sample fixture", () => {
    assert.equal(isValidDrawingModel(SAMPLE_DRAWING_MODEL), true);
  });

  it("rejects a model with a non-numeric wall coordinate", () => {
    const bad = {
      ...SAMPLE_DRAWING_MODEL,
      walls: [{ id: "wall-norr", start: { xMm: "0", yMm: 0 }, end: { xMm: 6000, yMm: 0 } }],
    };
    assert.equal(isValidDrawingModel(bad), false);
  });

  it("rejects null/non-object input", () => {
    assert.equal(isValidDrawingModel(null), false);
    assert.equal(isValidDrawingModel("hello"), false);
  });

  it("rejects a window missing sillHeightMm", () => {
    const bad = {
      ...SAMPLE_DRAWING_MODEL,
      windows: [{ id: "w", wallId: "wall-norr", offsetMm: 0, widthMm: 100, heightMm: 100 }],
    };
    assert.equal(isValidDrawingModel(bad), false);
  });
});

describe("parseRitEditResponse", () => {
  it("parses a valid moveDirection edit", () => {
    const raw = block({
      status: "ok",
      message: "Flyttade fönstret 500mm åt vänster.",
      edit: { targetId: "window-1", field: "offsetMm", mode: "moveDirection", direction: "left", magnitudeMm: 500 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.deepEqual(result, {
      status: "ok",
      message: "Flyttade fönstret 500mm åt vänster.",
      edit: { targetId: "window-1", field: "offsetMm", mode: "moveDirection", direction: "left", magnitudeMm: 500 },
    });
  });

  it("parses a valid absolute-width edit on a door", () => {
    const raw = block({
      status: "ok",
      message: "Gjorde dörren 1000mm bred.",
      edit: { targetId: "door-1", field: "widthMm", mode: "absolute", valueMm: 1000 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "ok");
    assert.deepEqual((result as { edit: unknown }).edit, {
      targetId: "door-1",
      field: "widthMm",
      mode: "absolute",
      valueMm: 1000,
    });
  });

  it("parses a valid delta edit on sillHeightMm", () => {
    const raw = block({
      status: "ok",
      message: "Sänkte brösthöjden 100mm.",
      edit: { targetId: "window-3", field: "sillHeightMm", mode: "delta", deltaMm: -100 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "ok");
    assert.deepEqual((result as { edit: unknown }).edit, {
      targetId: "window-3",
      field: "sillHeightMm",
      mode: "delta",
      deltaMm: -100,
    });
  });

  it("passes through a needsClarification with 2+ real candidate ids", () => {
    const raw = block({
      status: "needsClarification",
      message: "Menar du fönstret på norra väggens vänstra eller högra sida?",
      candidateIds: ["window-1", "window-2"],
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.deepEqual(result, {
      status: "needsClarification",
      message: "Menar du fönstret på norra väggens vänstra eller högra sida?",
      candidateIds: ["window-1", "window-2"],
    });
  });

  it("passes through an unsupported status with its message", () => {
    const raw = block({ status: "unsupported", message: "Jag kan inte lägga till nya fönster än." });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.deepEqual(result, {
      status: "unsupported",
      message: "Jag kan inte lägga till nya fönster än.",
    });
  });

  it("falls back to unsupported on a hallucinated targetId", () => {
    const raw = block({
      status: "ok",
      message: "Flyttade fönstret.",
      edit: { targetId: "window-99", field: "offsetMm", mode: "moveDirection", direction: "left", magnitudeMm: 500 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported when a moveDirection edit targets a non-offset field", () => {
    // offsetMm deltas only ever arrive via moveDirection so the NL-1
    // left/right sign convention is applied deterministically downstream,
    // never by the model's own arithmetic - a moveDirection edit on any
    // other field is self-contradictory and must not be trusted.
    const raw = block({
      status: "ok",
      message: "...",
      edit: { targetId: "window-1", field: "widthMm", mode: "moveDirection", direction: "left", magnitudeMm: 500 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported when an offsetMm edit uses delta mode", () => {
    const raw = block({
      status: "ok",
      message: "...",
      edit: { targetId: "window-1", field: "offsetMm", mode: "delta", deltaMm: 500 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported on a negative magnitudeMm", () => {
    const raw = block({
      status: "ok",
      message: "...",
      edit: { targetId: "window-1", field: "offsetMm", mode: "moveDirection", direction: "left", magnitudeMm: -500 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported when sillHeightMm targets a door (doors have no sill)", () => {
    const raw = block({
      status: "ok",
      message: "...",
      edit: { targetId: "door-1", field: "sillHeightMm", mode: "delta", deltaMm: -100 },
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported when needsClarification names fewer than 2 real candidates", () => {
    const raw = block({
      status: "needsClarification",
      message: "Vilket fönster?",
      candidateIds: ["window-1", "window-99"],
    });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported on malformed JSON inside the block", () => {
    const raw = "```json\n{not valid json\n```";
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("falls back to unsupported when there is no JSON block at all", () => {
    const result = parseRitEditResponse("Jag förstår inte riktigt.", SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
  });

  it("uses the fallback message text when the model omits its own message", () => {
    const raw = block({ status: "unsupported" });
    const result = parseRitEditResponse(raw, SAMPLE_DRAWING_MODEL);
    assert.equal(result.status, "unsupported");
    assert.match(result.message, /kunde tyvärr inte tolka/);
  });
});
