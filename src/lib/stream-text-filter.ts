// Used by /api/projekt/interview's streaming response: the model's
// reply always ends with a ```json ...``` block (parseInterviewMessage's
// own JSON_BLOCK regex, driven by the prompt's "avsluta med ett
// kodblock" instruction) that must never reach the client as visible
// text. Extracted out of the route as its own pure, stateful class so
// the fence-detection logic - the one part of the streaming change with
// a real leak risk if it's wrong - can be unit-tested directly, rather
// than only exercised end-to-end through a live Anthropic call.
//
// The prose itself is never instructed to use backticks, so the FIRST
// "```" anywhere in the stream is treated as the start of that block -
// simpler and strictly more conservative than matching the fuller
// "```json" marker (a stray bare backtick fence for some other reason
// would just stop live-streaming a turn early, not leak anything - the
// route's `final` event still carries the complete, correctly-parsed
// text regardless of where streaming stopped).

const FENCE_MARKER = "```";

// The longest suffix of `text` that is also a prefix of `pattern` - the
// standard "how much of a partial match might still complete on the
// NEXT chunk" check for streaming substring search. E.g.
// suffixOverlapWithPrefix("foo``", "```") === 2 (the trailing "``"
// could become "```" if the next chunk starts with another backtick).
// An earlier version of this file held back a flat, content-blind 2
// characters instead of actually computing this - caught by this file's
// own test suite: it let a full, already-complete "```" marker that
// landed entirely within one chunk get its first character emitted
// anyway, because the fixed-size holdback window didn't align with
// where the match actually started.
function suffixOverlapWithPrefix(text: string, pattern: string): number {
  const maxLen = Math.min(text.length, pattern.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (text.endsWith(pattern.slice(0, len))) return len;
  }
  return 0;
}

export class JsonFenceFilter {
  private accumulated = "";
  private emittedIndex = 0;
  private fenceStarted = false;

  // Feed one text delta as it arrives; returns the portion (if any) of
  // accumulated text that's now safe to show the user. Searches the
  // ENTIRE not-yet-emitted region for a full marker match (not just the
  // newly-arrived chunk) - a full match can only ever be found there
  // once, so this stays cheap even though it re-scans on every call.
  // When no full match is found yet, only the actual overlap between
  // the unemitted tail and the marker's prefix is held back - not a
  // blind constant - so plain text with no backticks in it streams out
  // immediately, with no artificial latency.
  push(chunk: string): string {
    this.accumulated += chunk;
    if (this.fenceStarted) return "";

    const unemitted = this.accumulated.slice(this.emittedIndex);
    const fenceOffset = unemitted.indexOf(FENCE_MARKER);

    if (fenceOffset !== -1) {
      const fenceIndex = this.emittedIndex + fenceOffset;
      const safeText = this.accumulated.slice(this.emittedIndex, fenceIndex);
      this.emittedIndex = fenceIndex;
      this.fenceStarted = true;
      return safeText;
    }

    const holdBack = suffixOverlapWithPrefix(unemitted, FENCE_MARKER);
    const safeEnd = this.accumulated.length - holdBack;
    const toEmit = this.accumulated.slice(this.emittedIndex, safeEnd);
    this.emittedIndex = safeEnd;
    return toEmit;
  }

  // Call once after the underlying stream has fully ended. If a fence
  // was found, there's nothing left to flush (everything from the fence
  // onward is the JSON block, deliberately never emitted). If no fence
  // ever appeared at all - parseInterviewMessage's own fallback path for
  // a malformed reply with no closing code block - whatever tail was
  // still held back as a possible partial marker never got to complete;
  // this returns it so no trailing text is silently dropped.
  finish(): string {
    if (this.fenceStarted) return "";
    const remaining = this.accumulated.slice(this.emittedIndex);
    this.emittedIndex = this.accumulated.length;
    return remaining;
  }
}
