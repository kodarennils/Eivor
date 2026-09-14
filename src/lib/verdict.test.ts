import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseAssistantMessage } from "./verdict.ts";

describe("parseAssistantMessage", () => {
  test("extracts verdict and summary from a well-formed block", () => {
    const raw = `Det här kräver bygglov.

\`\`\`json
{"verdict": "kräver_bygglov", "summary": "En sammanfattning."}
\`\`\``;
    const parsed = parseAssistantMessage(raw);
    assert.equal(parsed.text, "Det här kräver bygglov.");
    assert.equal(parsed.verdict, "kräver_bygglov");
    assert.equal(parsed.summary, "En sammanfattning.");
  });

  test("returns raw text with no verdict when there is no code block", () => {
    const parsed = parseAssistantMessage("Bara en fråga, inget beslut än.");
    assert.equal(parsed.text, "Bara en fråga, inget beslut än.");
    assert.equal(parsed.verdict, undefined);
  });

  test("falls through to raw text when the verdict value isn't one of the three valid ones", () => {
    const raw = '```json\n{"verdict": "kanske", "summary": "x"}\n```';
    const parsed = parseAssistantMessage(raw);
    assert.equal(parsed.verdict, undefined);
    assert.equal(parsed.text, raw.trim());
  });

  test("falls through to raw text on malformed JSON inside the block", () => {
    const raw = "Text innan.\n```json\n{not valid\n```";
    const parsed = parseAssistantMessage(raw);
    assert.equal(parsed.verdict, undefined);
    assert.equal(parsed.text, raw.trim());
  });

  test("summary is omitted (not empty string) when absent from the block", () => {
    const raw = '```json\n{"verdict": "osäkert"}\n```';
    const parsed = parseAssistantMessage(raw);
    assert.equal(parsed.verdict, "osäkert");
    assert.equal(parsed.summary, undefined);
  });
});
