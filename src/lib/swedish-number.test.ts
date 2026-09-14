import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSwedishNumber } from "./swedish-number.ts";

describe("parseSwedishNumber", () => {
  // Regression test for a real bug caught via live end-to-end simulation:
  // the interview stored heightMeters as "6,5" (a completely normal
  // Swedish answer to "hur högt blir det till nock?"), and
  // /api/projekt/ritning's plain Number("6,5") produced NaN, which
  // silently failed the "!heightMeters" check and blocked drawing
  // generation entirely.
  test("parses a Swedish comma-decimal string", () => {
    assert.equal(parseSwedishNumber("6,5"), 6.5);
  });

  test("parses a plain period/integer string unchanged", () => {
    assert.equal(parseSwedishNumber("6.5"), 6.5);
    assert.equal(parseSwedishNumber("10"), 10);
  });

  test("trims surrounding whitespace", () => {
    assert.equal(parseSwedishNumber(" 6,5 "), 6.5);
  });

  test("passes a number through unchanged", () => {
    assert.equal(parseSwedishNumber(6.5), 6.5);
  });

  test("returns NaN for missing or non-numeric input", () => {
    assert.ok(Number.isNaN(parseSwedishNumber(undefined)));
    assert.ok(Number.isNaN(parseSwedishNumber("typ sex meter")));
  });

  // Number("") is 0 in JS, not NaN - same quirk as plain Number(), kept
  // rather than special-cased since every call site already treats both
  // as falsy/missing.
  test("an empty string parses to 0, matching plain Number() behavior", () => {
    assert.equal(parseSwedishNumber(""), 0);
  });
});
