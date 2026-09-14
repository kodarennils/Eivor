import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeOverviewSectionsPresence,
  computeOverviewFieldPresence,
  hasAnyOverviewContent,
} from "@/lib/overview-sections";

const EMPTY_ARGS = {
  answers: {},
  photos: {},
  assessment: null,
  generatedDrawings: null,
  editedDrawingModel: null,
  detaljplanUploaded: false,
  situationsplanUploaded: false,
};

describe("computeOverviewSectionsPresence", () => {
  it("everything is false for a brand-new project with no data at all", () => {
    const presence = computeOverviewSectionsPresence(EMPTY_ARGS);
    assert.deepEqual(presence, {
      omProjektet: false,
      matt: false,
      bedomning: false,
      kontrollansvarig: false,
      fasadmaterial: false,
      ritningar: false,
      bilagor: false,
    });
    assert.equal(hasAnyOverviewContent(presence), false);
  });

  it("omProjektet becomes true as soon as projectType alone is answered", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { projectType: "Attefallshus" },
    });
    assert.equal(presence.omProjektet, true);
    assert.equal(presence.matt, false);
  });

  it("omProjektet becomes true from rooms alone, with no other field set", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { rooms: [{ type: "Allrum", percentage: "100" }] },
    });
    assert.equal(presence.omProjektet, true);
  });

  it("omProjektet becomes true from a single window count alone", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { windowsPerDirection: { norr: "2" } },
    });
    assert.equal(presence.omProjektet, true);
  });

  it("omProjektet stays false when windowsPerDirection has only empty strings", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { windowsPerDirection: { norr: "", öster: "  " } },
    });
    assert.equal(presence.omProjektet, false);
  });

  it("matt becomes true from a single dimension field", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { widthMeters: "6" },
    });
    assert.equal(presence.matt, true);
    assert.equal(presence.omProjektet, false);
  });

  it("bedomning is true only once a real verdict exists, not just an assessment object", () => {
    assert.equal(
      computeOverviewSectionsPresence({ ...EMPTY_ARGS, assessment: { summary: "text but no verdict" } })
        .bedomning,
      false,
    );
    assert.equal(
      computeOverviewSectionsPresence({
        ...EMPTY_ARGS,
        assessment: { verdict: "osäkert", summary: "text" },
      }).bedomning,
      true,
    );
  });

  it("kontrollansvarig is true only when requiresKontrollansvarig is exactly 'Ja'", () => {
    assert.equal(
      computeOverviewSectionsPresence({ ...EMPTY_ARGS, answers: { requiresKontrollansvarig: "Nej" } })
        .kontrollansvarig,
      false,
    );
    assert.equal(
      computeOverviewSectionsPresence({ ...EMPTY_ARGS, answers: { requiresKontrollansvarig: "Ja" } })
        .kontrollansvarig,
      true,
    );
  });

  it("fasadmaterial and bilagor both become true once a single facade photo exists", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      photos: { norr: "https://example.com/norr.jpg" },
    });
    assert.equal(presence.fasadmaterial, true);
    assert.equal(presence.bilagor, true);
  });

  it("bilagor becomes true from situationsplanUploaded or detaljplanUploaded alone, without affecting fasadmaterial", () => {
    const situationsplan = computeOverviewSectionsPresence({ ...EMPTY_ARGS, situationsplanUploaded: true });
    assert.equal(situationsplan.bilagor, true);
    assert.equal(situationsplan.fasadmaterial, false);

    const detaljplan = computeOverviewSectionsPresence({ ...EMPTY_ARGS, detaljplanUploaded: true });
    assert.equal(detaljplan.bilagor, true);
    assert.equal(detaljplan.fasadmaterial, false);
  });

  it("ritningar becomes true once width/depth/height make a live drawing model computable", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { widthMeters: "6", depthMeters: "5", heightMeters: "4" },
    });
    assert.equal(presence.ritningar, true);
    // Dimensions alone don't make "Mått" fields real project_answers
    // values missing - they DO satisfy `matt` too, since widthMeters
    // etc. are exactly what that section shows.
    assert.equal(presence.matt, true);
  });

  it("ritningar stays false when only partial dimensions exist", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { widthMeters: "6" },
    });
    assert.equal(presence.ritningar, false);
  });

  it("ritningar is true from a session-local editedDrawingModel even if answers alone wouldn't produce one", () => {
    const fakeModel = { walls: [], windows: [], doors: [], roofRidgeHeightMm: 0 };
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      editedDrawingModel: fakeModel,
    });
    assert.equal(presence.ritningar, true);
  });

  it("ritningar is true once drawings are generated, independent of answers", () => {
    const fakeDrawings = {
      plan: "<svg/>",
      elevations: { norr: "", öster: "", söder: "", väster: "" },
      section: "<svg/>",
      floorPlan: "<svg/>",
      situationsplan: null,
      kontrollplan: [],
      kontrollplanError: null,
      tekniskBeskrivning: {
        grundlaggning: "Ej angivet",
        stomme: "Ej angivet",
        ventilation: "Ej angivet",
        uppvarmning: "Ej angivet",
      },
    };
    const presence = computeOverviewSectionsPresence({ ...EMPTY_ARGS, generatedDrawings: fakeDrawings });
    assert.equal(presence.ritningar, true);
  });
});

describe("hasAnyOverviewContent", () => {
  it("is true if even a single section is present", () => {
    const presence = computeOverviewSectionsPresence({
      ...EMPTY_ARGS,
      answers: { projectType: "Attefallshus" },
    });
    assert.equal(hasAnyOverviewContent(presence), true);
  });
});

describe("computeOverviewFieldPresence", () => {
  it("everything is false for an empty answers object", () => {
    assert.deepEqual(computeOverviewFieldPresence({}), {
      projectType: false,
      withinDetailedPlan: false,
      rooms: false,
      windowsPerDirection: false,
      widthMeters: false,
      depthMeters: false,
      areaSqm: false,
      heightMeters: false,
      distanceToBoundaryMeters: false,
    });
  });

  it("only projectType flips true when only projectType is answered - the exact regression reported", () => {
    // Reported bug: answering "Typ av åtgärd" alone used to reveal
    // Detaljplan/Rumsindelning/Fönster too (all placeholder-empty),
    // because the whole "Om projektet" section shared one gate.
    const fields = computeOverviewFieldPresence({ projectType: "Annat" });
    assert.equal(fields.projectType, true);
    assert.equal(fields.withinDetailedPlan, false);
    assert.equal(fields.rooms, false);
    assert.equal(fields.windowsPerDirection, false);
  });

  it("withinDetailedPlan, rooms, and windowsPerDirection each flip independently", () => {
    assert.equal(computeOverviewFieldPresence({ withinDetailedPlan: "Ja" }).withinDetailedPlan, true);
    assert.equal(
      computeOverviewFieldPresence({ rooms: [{ type: "Allrum", percentage: "100" }] }).rooms,
      true,
    );
    assert.equal(
      computeOverviewFieldPresence({ windowsPerDirection: { söder: "2" } }).windowsPerDirection,
      true,
    );
  });

  it("windowsPerDirection is gated as one block - any single real direction reveals it, empty strings don't", () => {
    const onlyOneDirection = computeOverviewFieldPresence({
      windowsPerDirection: { norr: "3", öster: "", söder: "  " },
    });
    assert.equal(onlyOneDirection.windowsPerDirection, true);

    const allEmpty = computeOverviewFieldPresence({
      windowsPerDirection: { norr: "", öster: "", söder: "  ", väster: undefined },
    });
    assert.equal(allEmpty.windowsPerDirection, false);
  });

  it("each Mått field flips independently of the others", () => {
    const fields = computeOverviewFieldPresence({ widthMeters: "6" });
    assert.equal(fields.widthMeters, true);
    assert.equal(fields.depthMeters, false);
    assert.equal(fields.areaSqm, false);
    assert.equal(fields.heightMeters, false);
    assert.equal(fields.distanceToBoundaryMeters, false);
  });

  it("computeOverviewSectionsPresence's omProjektet/matt are exactly the OR of the matching field booleans", () => {
    const answers = { projectType: "Annat", heightMeters: "4" };
    const fields = computeOverviewFieldPresence(answers);
    const sections = computeOverviewSectionsPresence({ ...EMPTY_ARGS, answers });
    assert.equal(
      sections.omProjektet,
      fields.projectType || fields.withinDetailedPlan || fields.rooms || fields.windowsPerDirection,
    );
    assert.equal(
      sections.matt,
      fields.widthMeters ||
        fields.depthMeters ||
        fields.areaSqm ||
        fields.heightMeters ||
        fields.distanceToBoundaryMeters,
    );
  });
});
