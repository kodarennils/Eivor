import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { citationFor, formatRegelverkContext, type RegelverkMatch } from "./regelverk.ts";

function match(overrides: Partial<RegelverkMatch>): RegelverkMatch {
  return {
    id: "1",
    source: "Test",
    type: "lag",
    valid_from: null,
    paragraf_ref: null,
    content: "",
    similarity: 1,
    ...overrides,
  };
}

describe("citationFor", () => {
  test("a lag chunk with a paragraf_ref restores the SFS colon in the source name", () => {
    const result = citationFor(
      match({
        type: "lag",
        source: "Plan- och bygglag (2010-900)",
        paragraf_ref: "9 kap. 4 §",
      }),
    );
    assert.equal(result, "Plan- och bygglag (2010:900) 9 kap. 4 §");
  });

  // Regression test for a real bug caught this session: a paragraf_ref
  // extracted from vägledning prose refers to the law being explained,
  // not to a section of the guidance article - the citation must name the
  // law, never the vägledning article's own title.
  test("a vägledning chunk with a paragraf_ref cites the law, not the article title", () => {
    const result = citationFor(
      match({
        type: "vägledning",
        source: "Bygglov för nybyggnad av komplementbyggnad",
        paragraf_ref: "1 kap. 4 §",
        content: "Med nybyggnad avses ...",
      }),
    );
    assert.equal(result, "Plan- och bygglag 1 kap. 4 §");
  });

  test("a vägledning chunk quoting byggförordningen is attributed to PBF, not PBL", () => {
    const result = citationFor(
      match({
        type: "vägledning",
        source: "Anmälan",
        paragraf_ref: "7 kap. 5 §",
        content: "Enligt plan- och byggförordningen krävs ingen kontrollansvarig för ...",
      }),
    );
    assert.equal(result, "Plan- och byggförordning 7 kap. 5 §");
  });

  test("a vägledning chunk with no paragraf_ref falls back to a named Boverket source, not a fabricated page number", () => {
    const result = citationFor(
      match({ type: "vägledning", source: "Krav på tomter", paragraf_ref: null }),
    );
    assert.equal(result, "Boverket, Krav på tomter");
  });

  test("a föreskrift chunk with a paragraf_ref cites its own source name (its own numbering, not PBL's)", () => {
    const result = citationFor(
      match({
        type: "föreskrift",
        source: "bfs-2024-4-aktsamhet",
        paragraf_ref: "3 §",
      }),
    );
    assert.equal(result, "bfs-2024-4-aktsamhet 3 §");
  });

  test("a föreskrift chunk with no paragraf_ref is just its source name", () => {
    const result = citationFor(match({ type: "föreskrift", source: "bfs-2024-9-sakerhet-anvandning" }));
    assert.equal(result, "bfs-2024-9-sakerhet-anvandning");
  });
});

describe("formatRegelverkContext", () => {
  test("never uses generic numeric labels - each excerpt gets its real citation", () => {
    const formatted = formatRegelverkContext([
      match({ type: "lag", source: "Plan- och bygglag (2010-900)", paragraf_ref: "9 kap. 4 §" }),
    ]);
    assert.ok(formatted.includes("CITAT ATT ANVÄNDA: (Plan- och bygglag (2010:900) 9 kap. 4 §)"));
    assert.ok(!/\[\d+\]/.test(formatted));
  });
});
