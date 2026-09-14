import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseInterviewMessage,
  mergeAnswers,
  describeChanges,
  determinePhase,
  needsRooms,
  gateRequest,
  phaseProgress,
  checkDrawingReadiness,
  wrapupRoundTripComplete,
  validateRoomPercentages,
  enforceKontrollansvarigDisclosure,
  KONTROLLANSVARIG_DISCLAIMER,
  KONTROLLANSVARIG_NO_GROUNDING_NOTE,
  resolveSkipAheadRequested,
  wasAlreadyAskedAbout,
  textMatchesRequest,
  resolveDoneAndRequest,
  isUnusuallyLong,
  ensureDoneMessage,
  EMPTY_DONE_FALLBACK_MESSAGE,
} from "./interview.ts";

const NO_PHOTOS = { norr: false, öster: false, söder: false, väster: false };
const ALL_PHOTOS = { norr: true, öster: true, söder: true, väster: true };

describe("parseInterviewMessage", () => {
  test("extracts text, answers, request, and done from a well-formed reply", () => {
    const raw = `Hur bred blir tillbyggnaden?

\`\`\`json
{"answers": {"projectType": "Tillbyggnad", "widthMeters": "5"}, "request": "photo:norr", "done": false}
\`\`\``;
    const parsed = parseInterviewMessage(raw);
    assert.equal(parsed.text, "Hur bred blir tillbyggnaden?");
    assert.deepEqual(parsed.answers, { projectType: "Tillbyggnad", widthMeters: "5" });
    assert.equal(parsed.request, "photo:norr");
    assert.equal(parsed.done, false);
    assert.equal(parsed.skipAheadRequested, false);
  });

  test("extracts skipAheadRequested when the model sets it", () => {
    const raw = '```json\n{"answers": {}, "request": null, "done": false, "skipAheadRequested": true}\n```';
    assert.equal(parseInterviewMessage(raw).skipAheadRequested, true);
  });

  test("returns empty defaults when there is no JSON block", () => {
    const parsed = parseInterviewMessage("Bara text, inget kodblock.");
    assert.equal(parsed.text, "Bara text, inget kodblock.");
    assert.deepEqual(parsed.answers, {});
    assert.equal(parsed.request, null);
    assert.equal(parsed.done, false);
  });

  test("degrades gracefully on malformed JSON inside the block", () => {
    const raw = `Något gick snett.

\`\`\`json
{not valid json
\`\`\``;
    const parsed = parseInterviewMessage(raw);
    assert.equal(parsed.text, raw.trim());
    assert.deepEqual(parsed.answers, {});
    assert.equal(parsed.done, false);
  });

  test("trims whitespace-only scalar values instead of keeping them", () => {
    const raw = `\`\`\`json
{"answers": {"projectType": "   ", "widthMeters": "5"}, "request": null, "done": false}
\`\`\``;
    const parsed = parseInterviewMessage(raw);
    assert.equal("projectType" in parsed.answers, false);
    assert.equal(parsed.answers.widthMeters, "5");
  });

  test("parses rooms, filtering entries with no room type", () => {
    const raw = `\`\`\`json
{"answers": {"rooms": [{"type": "Kök", "percentage": "30"}, {"type": "", "percentage": "10"}]}, "request": null, "done": false}
\`\`\``;
    const parsed = parseInterviewMessage(raw);
    assert.deepEqual(parsed.answers.rooms, [{ type: "Kök", percentage: "30" }]);
  });

  test("parses windowsPerDirection, dropping unknown directions", () => {
    const raw = `\`\`\`json
{"answers": {"windowsPerDirection": {"norr": "2", "syd": "9", "söder": 3}}, "request": null, "done": false}
\`\`\``;
    const parsed = parseInterviewMessage(raw);
    assert.deepEqual(parsed.answers.windowsPerDirection, { norr: "2", söder: "3" });
  });

  test("only accepts known request values, otherwise null", () => {
    const validPhoto = parseInterviewMessage(
      '```json\n{"answers": {}, "request": "photo:väster", "done": false}\n```',
    );
    assert.equal(validPhoto.request, "photo:väster");

    const bogus = parseInterviewMessage(
      '```json\n{"answers": {}, "request": "photo:nordost", "done": false}\n```',
    );
    assert.equal(bogus.request, null);
  });
});

describe("mergeAnswers", () => {
  test("new non-empty values win over existing ones", () => {
    const merged = mergeAnswers({ widthMeters: "4" }, { widthMeters: "6" });
    assert.equal(merged.widthMeters, "6");
  });

  test("a field absent from the update keeps its previous value", () => {
    const merged = mergeAnswers({ widthMeters: "4", depthMeters: "3" }, { widthMeters: "6" });
    assert.equal(merged.depthMeters, "3");
  });

  test("rooms replace wholesale when a non-empty list is provided", () => {
    const existing = { rooms: [{ type: "Kök", percentage: "50" }] };
    const merged = mergeAnswers(existing, {
      rooms: [
        { type: "Kök", percentage: "30" },
        { type: "Sovrum", percentage: "70" },
      ],
    });
    assert.deepEqual(merged.rooms, [
      { type: "Kök", percentage: "30" },
      { type: "Sovrum", percentage: "70" },
    ]);
  });

  test("an empty rooms update does not erase previously known rooms", () => {
    const existing = { rooms: [{ type: "Kök", percentage: "50" }] };
    const merged = mergeAnswers(existing, {});
    assert.deepEqual(merged.rooms, [{ type: "Kök", percentage: "50" }]);
  });

  test("windowsPerDirection merges per-direction instead of replacing wholesale", () => {
    const existing = { windowsPerDirection: { norr: "2" } };
    const merged = mergeAnswers(existing, { windowsPerDirection: { söder: "1" } });
    assert.deepEqual(merged.windowsPerDirection, { norr: "2", söder: "1" });
  });
});

describe("describeChanges", () => {
  test("reports a Swedish label + value for each changed scalar field", () => {
    const note = describeChanges({}, { widthMeters: "6", depthMeters: "4" });
    assert.equal(note, "Sparat: bredd 6, djup 4");
  });

  test("returns null when nothing changed", () => {
    const before = { widthMeters: "6" };
    const after = { widthMeters: "6" };
    assert.equal(describeChanges(before, after), null);
  });

  test("detects a rooms change even when scalar fields are unchanged", () => {
    const before = { rooms: [] };
    const after = { rooms: [{ type: "Kök", percentage: "100" }] };
    assert.equal(describeChanges(before, after), "Sparat: rumsindelning");
  });

  // #1(b): once the model only sends new/changed fields (not a full
  // restatement every turn), any field that changes from one non-empty
  // value to a different one is either a deliberate correction or an
  // unwanted drift - either way it should be visible with the old value
  // shown, not folded into the same wording as a first-time fill.
  test("shows old → new when an already-known scalar value changes", () => {
    const before = { heightMeters: "3" };
    const after = { heightMeters: "4.8" };
    assert.equal(describeChanges(before, after), "Sparat: höjd till nock 3 → 4.8");
  });

  test("a first-time fill still shows just the new value, no arrow", () => {
    const before = {};
    const after = { heightMeters: "4.8" };
    assert.equal(describeChanges(before, after), "Sparat: höjd till nock 4.8");
  });

  test("rooms overwriting a previously non-empty list is labeled as changed", () => {
    const before = { rooms: [{ type: "Kök", percentage: "100" }] };
    const after = { rooms: [{ type: "Kök", percentage: "50" }, { type: "Sovrum", percentage: "50" }] };
    assert.equal(describeChanges(before, after), "Sparat: rumsindelning (ändrad)");
  });

  test("windowsPerDirection overwriting a previously non-empty value is labeled as changed", () => {
    const before = { windowsPerDirection: { norr: "2" } };
    const after = { windowsPerDirection: { norr: "3" } };
    assert.equal(describeChanges(before, after), "Sparat: fönster (ändrade)");
  });
});

// Risk-inventory item #1: (c) the model is no longer asked to restate
// every known field every turn - only new/changed values are expected in
// a turn's JSON block, reducing the surface for silent restatement drift
// at the source rather than trying to detect it after the fact. These
// exercise the full chain (parseInterviewMessage -> mergeAnswers ->
// describeChanges) the way route.ts actually uses them together, to
// confirm the reduced-restatement extraction behaves correctly end to
// end, not just at the individual-function level already covered above.
describe("reduced-restatement extraction end-to-end (#1c/#1b)", () => {
  test("a genuine correction (only the changed field sent) is saved and shown with its old value", () => {
    const existing = { projectType: "Tillbyggnad", widthMeters: "6", depthMeters: "4" };
    // Simulates a turn where the model - per the new instruction - sends
    // ONLY the field that changed, not a full restatement of everything.
    const raw = '```json\n{"answers": {"widthMeters": "6.4"}, "request": null, "done": false}\n```';
    const parsed = parseInterviewMessage(raw);
    const merged = mergeAnswers(existing, parsed.answers);

    assert.equal(merged.widthMeters, "6.4");
    assert.equal(merged.depthMeters, "4"); // untouched, still present
    assert.equal(merged.projectType, "Tillbyggnad"); // untouched, still present
    assert.equal(describeChanges(existing, merged), "Sparat: bredd 6 → 6.4");
  });

  test("a field not mentioned this turn stays exactly as it was - no re-confirmation, no drift", () => {
    const existing = {
      projectType: "Tillbyggnad",
      widthMeters: "6",
      depthMeters: "4",
      heightMeters: "3.5",
    };
    // Only distanceToBoundaryMeters is new this turn; nothing else is
    // restated, matching the new instruction.
    const raw = '```json\n{"answers": {"distanceToBoundaryMeters": "5"}, "request": null, "done": false}\n```';
    const parsed = parseInterviewMessage(raw);
    const merged = mergeAnswers(existing, parsed.answers);

    assert.equal(merged.widthMeters, "6");
    assert.equal(merged.depthMeters, "4");
    assert.equal(merged.heightMeters, "3.5");
    assert.equal(merged.distanceToBoundaryMeters, "5");
    // Only the genuinely new field should register as a change - nothing
    // else was re-sent, so nothing else should look like it changed.
    assert.equal(describeChanges(existing, merged), "Sparat: avstånd till tomtgräns 5");
  });
});

describe("needsRooms", () => {
  test("tillbyggnad, nybyggnad, and attefallshus need a floor plan", () => {
    assert.equal(needsRooms("Tillbyggnad"), true);
    assert.equal(needsRooms("Nybyggnad"), true);
    assert.equal(needsRooms("Attefallshus"), true);
  });

  test("fasadändring and altan/uterum do not", () => {
    assert.equal(needsRooms("Fasadändring"), false);
    assert.equal(needsRooms("Altan eller uterum"), false);
  });

  test("handles missing/non-string input without throwing", () => {
    assert.equal(needsRooms(undefined), false);
    assert.equal(needsRooms(""), false);
  });
});

describe("determinePhase", () => {
  test("starts at projectType when nothing is known", () => {
    assert.equal(determinePhase({}, NO_PHOTOS), "projectType");
  });

  test("moves to matt once projectType is known", () => {
    assert.equal(determinePhase({ projectType: "Tillbyggnad" }, NO_PHOTOS), "matt");
  });

  test("requires all four measurements before leaving matt", () => {
    const partial = { projectType: "Tillbyggnad", widthMeters: "5", depthMeters: "4" };
    assert.equal(determinePhase(partial, NO_PHOTOS), "matt");
  });

  test("moves to boundary once all measurements are known", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "boundary");
  });

  test("moves to detaljplan once distance to boundary is known", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "detaljplan");
  });

  test("moves to kontrollansvarig once detaljplan status is known", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "kontrollansvarig");
  });

  test("moves to rooms (not photos) once KA is assessed, for a room-requiring type", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
      requiresKontrollansvarig: "Ja",
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "rooms");
  });

  test("skips rooms entirely for a type that doesn't need a floor plan", () => {
    const answers = {
      projectType: "Fasadändring",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
      requiresKontrollansvarig: "Nej",
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "photos");
  });

  test("moves to photos once room details are complete", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
      requiresKontrollansvarig: "Ja",
      rooms: [{ type: "Kök", percentage: "100" }],
      mainEntranceDirection: "söder",
      windowsPerDirection: { söder: "2" },
    };
    assert.equal(determinePhase(answers, NO_PHOTOS), "photos");
  });

  test("moves to wrapup once every facade photo is uploaded", () => {
    const answers = {
      projectType: "Fasadändring",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
      requiresKontrollansvarig: "Nej",
    };
    assert.equal(determinePhase(answers, ALL_PHOTOS), "wrapup");
  });
});

describe("gateRequest", () => {
  // Regression test for a real bug caught via live simulation against the
  // actual Anthropic API: the model set request:"photo:norr" while it was
  // still in the detaljplan phase (reply text never actually asked for a
  // photo), which would have popped the upload widget into the chat a
  // phase early.
  test("nulls out a photo request made outside the photos phase", () => {
    assert.equal(gateRequest("detaljplan", "photo:norr", NO_PHOTOS), null);
  });

  test("allows a photo request during the photos phase for a still-missing direction", () => {
    assert.equal(gateRequest("photos", "photo:norr", NO_PHOTOS), "photo:norr");
  });

  test("nulls out a photo request for a direction that's already uploaded", () => {
    assert.equal(gateRequest("photos", "photo:norr", { ...NO_PHOTOS, norr: true }), null);
  });

  test("nulls out detaljplan-status outside the detaljplan phase", () => {
    assert.equal(gateRequest("matt", "detaljplan-status", NO_PHOTOS), null);
  });

  test("allows detaljplan-status during the detaljplan phase", () => {
    assert.equal(gateRequest("detaljplan", "detaljplan-status", NO_PHOTOS), "detaljplan-status");
  });

  test("nulls out situationsplan outside the wrapup phase", () => {
    assert.equal(gateRequest("boundary", "situationsplan", NO_PHOTOS), null);
  });

  test("allows situationsplan during the wrapup phase", () => {
    assert.equal(gateRequest("wrapup", "situationsplan", ALL_PHOTOS), "situationsplan");
  });

  test("passes null through unchanged", () => {
    assert.equal(gateRequest("rooms", null, NO_PHOTOS), null);
  });
});

describe("phaseProgress", () => {
  test("starts at 0 completed for a fresh project", () => {
    assert.deepEqual(phaseProgress({}, NO_PHOTOS), { completed: 0, total: 6 });
  });

  // Regression test for the real bug this replaced: the UI's old
  // hardcoded 6-field counter reached "6 av 6" as soon as
  // withinDetailedPlan was answered and then sat frozen there through
  // rooms and all four photo uploads. phaseProgress()'s total grows to
  // include rooms/photos so completion can never plateau early like that.
  test("a room-requiring type isn't full once only the first four phases are done", () => {
    const answers = {
      projectType: "Tillbyggnad",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
    };
    const progress = phaseProgress(answers, NO_PHOTOS);
    assert.equal(progress.total, 7); // includes "rooms", since Tillbyggnad needs it
    assert.equal(progress.completed, 4); // projectType, matt, boundary, detaljplan
    assert.notEqual(progress.completed, progress.total);
  });

  test("a non-room-requiring type has a total of 6, matching the old fixed count", () => {
    const answers = { projectType: "Fasadändring" };
    assert.equal(phaseProgress(answers, NO_PHOTOS).total, 6);
  });

  test("reaches full completion only once every phase (including photos) is done", () => {
    const answers = {
      projectType: "Fasadändring",
      widthMeters: "5",
      depthMeters: "4",
      areaSqm: "20",
      heightMeters: "3.5",
      distanceToBoundaryMeters: "3",
      withinDetailedPlan: "Ja",
      requiresKontrollansvarig: "Nej",
    };
    assert.deepEqual(phaseProgress(answers, ALL_PHOTOS), { completed: 6, total: 6 });
  });
});

describe("checkDrawingReadiness", () => {
  test("not ready with no answers at all - reports all three missing", () => {
    const result = checkDrawingReadiness({});
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, ["bredd", "djup", "höjd till nock"]);
  });

  test("reports only the specific fields still missing", () => {
    const result = checkDrawingReadiness({ widthMeters: "6", depthMeters: "4" });
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, ["höjd till nock"]);
  });

  test("ready once width, depth, and height are all present", () => {
    const result = checkDrawingReadiness({
      widthMeters: "6",
      depthMeters: "4",
      heightMeters: "3.5",
    });
    assert.deepEqual(result, { ready: true, missing: [] });
  });

  test("accepts a Swedish comma-decimal value, matching /api/projekt/ritning's own parsing", () => {
    const result = checkDrawingReadiness({
      widthMeters: "6",
      depthMeters: "4",
      heightMeters: "3,5",
    });
    assert.equal(result.ready, true);
  });

  test("a literal '0' is treated the same as missing, matching ritning's parsed-truthy check", () => {
    const result = checkDrawingReadiness({ widthMeters: "0", depthMeters: "4", heightMeters: "3" });
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, ["bredd"]);
  });

  test("other collected fields (rooms, boundary, detaljplan) don't affect drawing readiness", () => {
    const result = checkDrawingReadiness({
      widthMeters: "6",
      depthMeters: "4",
      heightMeters: "3.5",
      rooms: [],
      distanceToBoundaryMeters: undefined,
      withinDetailedPlan: undefined,
    });
    assert.equal(result.ready, true);
  });
});

// Risk-inventory items #2/#5/#6: projectType, withinDetailedPlan, and
// requiresKontrollansvarig used to accept any non-empty string, so a
// drifted value could silently fail every downstream exact-match check
// (e.g. the kontrollansvarig warning card only renders on `=== "Ja"`).
describe("parseInterviewMessage: enum-constrained fields (#2/#5/#6)", () => {
  test("drops an out-of-enum requiresKontrollansvarig value instead of trusting it", () => {
    const raw =
      '```json\n{"answers": {"requiresKontrollansvarig": "Osäkert"}, "request": null, "done": false}\n```';
    assert.equal("requiresKontrollansvarig" in parseInterviewMessage(raw).answers, false);
  });

  test("accepts a valid requiresKontrollansvarig value", () => {
    const raw =
      '```json\n{"answers": {"requiresKontrollansvarig": "Ja"}, "request": null, "done": false}\n```';
    assert.equal(parseInterviewMessage(raw).answers.requiresKontrollansvarig, "Ja");
  });

  test("drops an out-of-enum projectType value", () => {
    const raw = '```json\n{"answers": {"projectType": "nybygge"}, "request": null, "done": false}\n```';
    assert.equal("projectType" in parseInterviewMessage(raw).answers, false);
  });

  test("accepts a valid projectType value", () => {
    const raw = '```json\n{"answers": {"projectType": "Nybyggnad"}, "request": null, "done": false}\n```';
    assert.equal(parseInterviewMessage(raw).answers.projectType, "Nybyggnad");
  });

  test("drops an out-of-enum withinDetailedPlan value", () => {
    const raw =
      '```json\n{"answers": {"withinDetailedPlan": "Japp"}, "request": null, "done": false}\n```';
    assert.equal("withinDetailedPlan" in parseInterviewMessage(raw).answers, false);
  });

  test("accepts a valid withinDetailedPlan value", () => {
    const raw = '```json\n{"answers": {"withinDetailedPlan": "Vet inte"}, "request": null, "done": false}\n```';
    assert.equal(parseInterviewMessage(raw).answers.withinDetailedPlan, "Vet inte");
  });

  test("an out-of-enum value on one field doesn't affect unrelated valid fields", () => {
    const raw =
      '```json\n{"answers": {"projectType": "Nybyggnad", "requiresKontrollansvarig": "Kanske"}, "request": null, "done": false}\n```';
    const parsed = parseInterviewMessage(raw);
    assert.equal(parsed.answers.projectType, "Nybyggnad");
    assert.equal("requiresKontrollansvarig" in parsed.answers, false);
  });
});

// Risk-inventory item #8: a non-numeric window answer used to pass
// through as an opaque string and silently become 0 windows downstream.
describe("parseInterviewMessage: numeric window validation (#8)", () => {
  test("drops a non-numeric window count", () => {
    const raw =
      '```json\n{"answers": {"windowsPerDirection": {"norr": "några"}}, "request": null, "done": false}\n```';
    assert.equal(parseInterviewMessage(raw).answers.windowsPerDirection, undefined);
  });

  test("accepts a numeric window count, including Swedish comma-decimal", () => {
    const raw =
      '```json\n{"answers": {"windowsPerDirection": {"norr": "2", "söder": "1,5"}}, "request": null, "done": false}\n```';
    assert.deepEqual(parseInterviewMessage(raw).answers.windowsPerDirection, {
      norr: "2",
      söder: "1,5",
    });
  });

  test("a non-numeric direction doesn't block other, valid directions in the same turn", () => {
    const raw =
      '```json\n{"answers": {"windowsPerDirection": {"norr": "2", "öster": "ett par"}}, "request": null, "done": false}\n```';
    assert.deepEqual(parseInterviewMessage(raw).answers.windowsPerDirection, { norr: "2" });
  });
});

// Risk-inventory item #4: "done" used to only check the phase AFTER the
// merge, letting the model declare done on the very first turn wrapup
// instructions were shown - before the user had any chance to respond.
describe("wrapupRoundTripComplete (#4)", () => {
  test("false when wrapup was only just reached this turn", () => {
    assert.equal(wrapupRoundTripComplete("photos", "wrapup"), false);
  });

  test("true only once wrapup was already active before this turn too", () => {
    assert.equal(wrapupRoundTripComplete("wrapup", "wrapup"), true);
  });

  test("false if the merge somehow moved phase away from wrapup", () => {
    assert.equal(wrapupRoundTripComplete("wrapup", "photos"), false);
  });
});

// Risk-inventory item #7: nothing checked that room percentages actually
// summed to ~100%, so a broken set would render a visibly wrong floor
// plan with no signal anything was off.
describe("validateRoomPercentages (#7)", () => {
  test("valid when percentages sum to exactly 100", () => {
    const result = validateRoomPercentages([
      { type: "Kök", percentage: "40" },
      { type: "Vardagsrum", percentage: "60" },
    ]);
    assert.deepEqual(result, { valid: true, sum: 100 });
  });

  test("valid within the 'ca 100%' tolerance band", () => {
    assert.equal(
      validateRoomPercentages([{ type: "Allrum", percentage: "92" }]).valid,
      true,
    );
  });

  test("invalid when the sum is far below 100", () => {
    const result = validateRoomPercentages([{ type: "Kök", percentage: "60" }]);
    assert.equal(result.valid, false);
    assert.equal(result.sum, 60);
  });

  test("invalid when the sum is far above 100", () => {
    const result = validateRoomPercentages([
      { type: "Kök", percentage: "80" },
      { type: "Vardagsrum", percentage: "80" },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.sum, 160);
  });

  test("handles Swedish comma-decimal percentages", () => {
    assert.equal(
      validateRoomPercentages([{ type: "Kök", percentage: "99,5" }]).valid,
      true,
    );
  });
});

// Risk-inventory item #3: the kontrollansvarig determination must be
// grounded in retrieved regelverk (never general knowledge) and, when
// "Ja", must carry a fixed disclaimer - both were previously just prompt
// instructions with nothing checking either happened.
describe("enforceKontrollansvarigDisclosure (#3)", () => {
  test("passes through unchanged outside the kontrollansvarig phase", () => {
    const result = enforceKontrollansvarigDisclosure({
      phase: "matt",
      hasGroundingContext: false,
      text: "Hur brett blir det?",
      answers: { requiresKontrollansvarig: "Ja" },
    });
    assert.deepEqual(result, { text: "Hur brett blir det?", answers: { requiresKontrollansvarig: "Ja" } });
  });

  test("overrides to 'Vet inte' and appends a note when there's no grounding context", () => {
    const result = enforceKontrollansvarigDisclosure({
      phase: "kontrollansvarig",
      hasGroundingContext: false,
      text: "Det här kräver definitivt en kontrollansvarig.",
      answers: { requiresKontrollansvarig: "Ja" },
    });
    assert.equal(result.answers.requiresKontrollansvarig, "Vet inte");
    assert.ok(result.text.includes(KONTROLLANSVARIG_NO_GROUNDING_NOTE));
  });

  test("doesn't duplicate the no-grounding note if already present", () => {
    const text = `Kort svar.\n\n${KONTROLLANSVARIG_NO_GROUNDING_NOTE}`;
    const result = enforceKontrollansvarigDisclosure({
      phase: "kontrollansvarig",
      hasGroundingContext: false,
      text,
      answers: {},
    });
    assert.equal(result.text, text);
  });

  test("appends the required disclaimer when 'Ja' and grounded but the model omitted it", () => {
    const result = enforceKontrollansvarigDisclosure({
      phase: "kontrollansvarig",
      hasGroundingContext: true,
      text: "Det här kräver troligen en kontrollansvarig.",
      answers: { requiresKontrollansvarig: "Ja" },
    });
    assert.ok(result.text.includes(KONTROLLANSVARIG_DISCLAIMER));
    assert.equal(result.answers.requiresKontrollansvarig, "Ja");
  });

  test("doesn't duplicate the disclaimer if the model already included it", () => {
    const text = `Ja, det krävs. ${KONTROLLANSVARIG_DISCLAIMER}`;
    const result = enforceKontrollansvarigDisclosure({
      phase: "kontrollansvarig",
      hasGroundingContext: true,
      text,
      answers: { requiresKontrollansvarig: "Ja" },
    });
    assert.equal(result.text, text);
  });

  test("doesn't append the disclaimer when grounded and the answer is 'Nej'", () => {
    const result = enforceKontrollansvarigDisclosure({
      phase: "kontrollansvarig",
      hasGroundingContext: true,
      text: "Det krävs inte i det här fallet.",
      answers: { requiresKontrollansvarig: "Nej" },
    });
    assert.equal(result.text, "Det krävs inte i det här fallet.");
  });
});

// Risk-inventory item #9: skipAheadRequested is a self-report with the
// same shape as the original unguarded "done" - cross-checked against
// the user's own latest message in both directions.
describe("resolveSkipAheadRequested (#9)", () => {
  test("rejects a claimed true with no textual support (hallucination guard)", () => {
    assert.equal(resolveSkipAheadRequested(true, "Det blir 5 meter brett."), false);
  });

  test("confirms a claimed true when the message plausibly supports it", () => {
    assert.equal(resolveSkipAheadRequested(true, "Jag vill ha ritningar nu."), true);
  });

  test("catches an explicit request the model failed to flag (false-negative fallback)", () => {
    assert.equal(resolveSkipAheadRequested(false, "Jag vill ha ritningar nu, kan vi hoppa till det?"), true);
  });

  test("does not override a claimed false for an unrelated message", () => {
    assert.equal(resolveSkipAheadRequested(false, "Det blir 5 meter brett och 4 djupt."), false);
  });

  test("a passing mention of 'ritningar' alone isn't enough to trigger the false-negative override", () => {
    assert.equal(resolveSkipAheadRequested(false, "Jag vill veta mer om hur ritningarna brukar se ut."), false);
  });
});

// Risk-inventory item #10: the "never re-ask a known field" protection
// only structurally existed for fields with their own dedicated phase -
// the two frivilligt wrapup items have no such phase and could be
// re-asked on every wrapup turn without this.
describe("wasAlreadyAskedAbout (#10)", () => {
  test("false when no assistant message mentions any of the keywords", () => {
    const messages = [
      { role: "user" as const, content: "Hej" },
      { role: "assistant" as const, content: "Vad vill du bygga?" },
    ];
    assert.equal(wasAlreadyAskedAbout(messages, ["fastighetsbeteckning"]), false);
  });

  test("true once an assistant message has mentioned a keyword", () => {
    const messages = [
      { role: "assistant" as const, content: "Vet du fastighetsbeteckningen för tomten?" },
    ];
    assert.equal(wasAlreadyAskedAbout(messages, ["fastighetsbeteckning"]), true);
  });

  test("a user message mentioning the keyword doesn't count - only the assistant asking does", () => {
    const messages = [{ role: "user" as const, content: "Fastighetsbeteckningen är okänd för mig." }];
    assert.equal(wasAlreadyAskedAbout(messages, ["fastighetsbeteckning"]), false);
  });

  test("matches case-insensitively", () => {
    const messages = [{ role: "assistant" as const, content: "Har du en SITUATIONSPLAN?" }];
    assert.equal(wasAlreadyAskedAbout(messages, ["situationsplan"]), true);
  });
});

// Risk-inventory item #11: gateRequest only checks the request *value*
// against the phase - this additionally checks the reply *text* actually
// matches, closing the exact gap behind the original live-observed bug
// (request:"photo:norr" with reply text that never mentioned a photo).
describe("textMatchesRequest (#11)", () => {
  test("null request always matches (nothing to check)", () => {
    assert.equal(textMatchesRequest("Tack för det!", null), true);
  });

  test("a photo request matches when the text mentions a photo", () => {
    assert.equal(textMatchesRequest("Kan du ladda upp ett foto av norra fasaden?", "photo:norr"), true);
  });

  test("a photo request is rejected when the text doesn't mention a photo at all", () => {
    assert.equal(textMatchesRequest("Tack, bra att veta!", "photo:norr"), false);
  });

  test("a situationsplan request matches on 'nybyggnadskarta'", () => {
    assert.equal(
      textMatchesRequest("Har du en nybyggnadskarta du kan ladda upp?", "situationsplan"),
      true,
    );
  });

  test("a detaljplan-status request is rejected when the text is unrelated", () => {
    assert.equal(textMatchesRequest("Vilken häftig tomt!", "detaljplan-status"), false);
  });
});

// Risk-inventory item #12: done and request were gated independently, so
// both could legitimately survive at once - an incoherent combined UI
// state (a review screen and an upload widget in the same turn).
describe("resolveDoneAndRequest (#12)", () => {
  test("drops the request when done is true", () => {
    assert.deepEqual(resolveDoneAndRequest(true, "situationsplan"), { done: true, request: null });
  });

  test("keeps the request when done is false", () => {
    assert.deepEqual(resolveDoneAndRequest(false, "photo:norr"), { done: false, request: "photo:norr" });
  });

  test("done:false with no request stays a no-op", () => {
    assert.deepEqual(resolveDoneAndRequest(false, null), { done: false, request: null });
  });
});

// Risk-inventory item #13: only response length is reliably, cheaply
// checkable server-side - Swedish-only and question-count checks were
// judged impractical (high false-positive/negative rate without a
// second model call) and are accepted as a known cosmetic risk.
describe("isUnusuallyLong (#13)", () => {
  test("false for a normal, short response", () => {
    assert.equal(isUnusuallyLong("Tack, det blir noterat! Hur brett blir det?"), false);
  });

  test("true for a response well past the length a '1-2 frågor, kort' reply should ever reach", () => {
    assert.equal(isUnusuallyLong("x".repeat(700)), true);
  });

  test("boundary: exactly at the threshold is not flagged, one over is", () => {
    assert.equal(isUnusuallyLong("x".repeat(600)), false);
    assert.equal(isUnusuallyLong("x".repeat(601)), true);
  });
});

// Live-observed bug: the model occasionally violates the "text before
// the JSON block" formatting instruction, producing an empty parsed
// `text` - most visibly on the turn done becomes true, where the user
// would otherwise see a blank chat bubble at the single most important
// moment in the flow.
describe("ensureDoneMessage", () => {
  test("substitutes the fallback when text is empty and done is true (the reported case)", () => {
    assert.equal(ensureDoneMessage("", true), EMPTY_DONE_FALLBACK_MESSAGE);
  });

  test("substitutes the fallback when text is whitespace-only and done is true", () => {
    assert.equal(ensureDoneMessage("   \n  ", true), EMPTY_DONE_FALLBACK_MESSAGE);
  });

  test("leaves real text alone when done is true", () => {
    assert.equal(ensureDoneMessage("Klart, här är sammanfattningen!", true), "Klart, här är sammanfattningen!");
  });

  test("does not substitute when text is empty but done is false - an empty mid-conversation turn is a separate, pre-existing issue this doesn't try to cover", () => {
    assert.equal(ensureDoneMessage("", false), "");
  });
});
