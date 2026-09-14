import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTekniskBeskrivning } from "./teknisk-beskrivning.ts";

describe("buildTekniskBeskrivning", () => {
  test("marks every field 'Ej angivet' when nothing is known - never invents a value", () => {
    const result = buildTekniskBeskrivning({}, {});
    assert.deepEqual(result, {
      grundlaggning: "Ej angivet",
      stomme: "Ej angivet",
      ventilation: "Ej angivet",
      uppvarmning: "Ej angivet",
    });
  });

  test("ventilation and uppvärmning are always 'Ej angivet' regardless of input, since nothing collects them", () => {
    const result = buildTekniskBeskrivning(
      { ventilation: "FTX", uppvarmning: "Fjärrvärme" } as Record<string, unknown>,
      {},
    );
    assert.equal(result.ventilation, "Ej angivet");
    assert.equal(result.uppvarmning, "Ej angivet");
  });

  test("derives stomme from facade material analysis, deduplicated across directions", () => {
    const result = buildTekniskBeskrivning(
      {},
      {
        norr: { material: "Träpanel", color: "Vit" },
        söder: { material: "Träpanel", color: "Vit" },
        öster: { material: "Tegel", color: "Röd" },
      },
    );
    assert.equal(result.stomme, "Träpanel, Tegel");
  });

  test("respects an explicit grundläggning answer if one is present", () => {
    const result = buildTekniskBeskrivning(
      { grundlaggning: "Plintgrund" } as Record<string, unknown>,
      {},
    );
    assert.equal(result.grundlaggning, "Plintgrund");
  });
});
