import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JsonFenceFilter } from "@/lib/stream-text-filter";

// Feeds a full string through the filter one character at a time (the
// worst case for marker-splitting - every possible split point of the
// "```" marker gets exercised), returning what push() emitted overall
// plus finish()'s trailing flush concatenated together.
function runCharByChar(fullText: string): string {
  const filter = new JsonFenceFilter();
  let emitted = "";
  for (const char of fullText) {
    emitted += filter.push(char);
  }
  emitted += filter.finish();
  return emitted;
}

describe("JsonFenceFilter", () => {
  it("emits plain text immediately, with no artificial holdback, when it can't possibly be a marker prefix", () => {
    const filter = new JsonFenceFilter();
    assert.equal(filter.push("Hej"), "Hej");
    assert.equal(filter.push("!"), "!");
  });

  it("holds back only a trailing single backtick, not a blind fixed window", () => {
    const filter = new JsonFenceFilter();
    // "Hej`" - the trailing "`" could become "``" or "```" next chunk,
    // so only that one character is held back, not e.g. "j`" too.
    assert.equal(filter.push("Hej`"), "Hej");
    // Followed by plain text (no second backtick): the held-back "`"
    // turns out not to be part of a marker, so it's released along with
    // the new text.
    assert.equal(filter.push(" du"), "` du");
  });

  it("holds back a trailing double backtick, and emits nothing (not even a partial marker) once a full match completes", () => {
    const filter = new JsonFenceFilter();
    assert.equal(filter.push("Hej``"), "Hej");
    assert.equal(filter.push("`json\n{}\n```"), "");
  });

  it("recovers the full text unchanged when no fence ever appears, even split across many tiny chunks", () => {
    const text = "Vad vill du bygga eller ändra på fastigheten?";
    assert.equal(runCharByChar(text), text);
  });

  it("recovers the full text via a few larger chunks too, not just char-by-char", () => {
    const filter = new JsonFenceFilter();
    let emitted = "";
    emitted += filter.push("Hej! Vad vill du bygga ");
    emitted += filter.push("eller ändra på fastigheten?");
    emitted += filter.finish();
    assert.equal(emitted, "Hej! Vad vill du bygga eller ändra på fastigheten?");
  });

  it("stops exactly at the fence when it arrives in one single chunk", () => {
    const filter = new JsonFenceFilter();
    const emitted = filter.push('Tack för det!\n\n```json\n{"done": false}\n```');
    assert.equal(emitted, "Tack för det!\n\n");
    // Nothing further is ever emitted, even if fed more text afterward.
    assert.equal(filter.push(" mer text"), "");
    assert.equal(filter.finish(), "");
  });

  it("never leaks any part of the marker when it's split across two chunks, for every split point", () => {
    const prefix = "Tack för det!\n\n";
    const jsonBlock = '```json\n{"done": false}\n```';
    const full = prefix + jsonBlock;
    // Every possible split point of the whole string, not just around
    // the marker itself - the marker-splitting case is the risky one,
    // but sweeping all offsets costs nothing and covers it exhaustively.
    for (let splitAt = 0; splitAt <= full.length; splitAt++) {
      const filter = new JsonFenceFilter();
      const emitted =
        filter.push(full.slice(0, splitAt)) + filter.push(full.slice(splitAt)) + filter.finish();
      assert.equal(emitted, prefix, `split at ${splitAt} leaked part of the fence or dropped prefix text`);
    }
  });

  it("never leaks the marker split across three chunks either", () => {
    const prefix = "Ok.";
    const jsonBlock = '```json\n{}\n```';
    const full = prefix + jsonBlock;
    for (let a = 0; a <= full.length; a++) {
      for (let b = a; b <= full.length; b++) {
        const filter = new JsonFenceFilter();
        const emitted =
          filter.push(full.slice(0, a)) +
          filter.push(full.slice(a, b)) +
          filter.push(full.slice(b)) +
          filter.finish();
        assert.equal(emitted, prefix, `split at (${a},${b}) leaked part of the fence`);
      }
    }
  });

  it("treats a bare stray ``` (no 'json') as a cutoff too - conservative by design", () => {
    const filter = new JsonFenceFilter();
    const emitted = filter.push("Text med ``` inline av någon anledning, mer text sen.");
    assert.equal(emitted, "Text med ");
    assert.equal(filter.push("ännu mer"), "");
  });

  it("handles the fence appearing with zero preceding text", () => {
    const filter = new JsonFenceFilter();
    const emitted = filter.push('```json\n{"done": true}\n```');
    assert.equal(emitted, "");
    assert.equal(filter.finish(), "");
  });

  it("finish() is a no-op (returns empty) once a fence has already been found", () => {
    const filter = new JsonFenceFilter();
    filter.push("Hej ```json\n{}\n```");
    assert.equal(filter.finish(), "");
  });

  it("handles an entirely empty stream", () => {
    const filter = new JsonFenceFilter();
    assert.equal(filter.finish(), "");
  });
});
