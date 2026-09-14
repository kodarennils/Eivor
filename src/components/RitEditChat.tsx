"use client";

// NL-4: the natural-language drawing-edit surface. Deliberately its own
// small message list + input + submit button, NOT routed through
// ProjectInterviewChat - per the explicit decision to keep the interview
// chat and drawing-edit input as fully separate surfaces, no per-message
// routing between two endpoints. Lives in the Redigera tab, next to
// DrawingModelEditor (Phase D's drag/type editor) - both read/write the
// same lifted-to-page.tsx DrawingModel via onModelChange, so a drag, a
// typed number, and a chat instruction all end up in one place.

import { useState } from "react";
import { ArrowUpIcon } from "@/components/icons";
import type { DrawingModel } from "@/lib/drawing-schema";
import { applyRitEdit } from "@/lib/apply-rit-edit";
import { MAX_RIT_EDIT_HISTORY, type RitEditResult } from "@/lib/rit-edit";

type ApiMessage = { role: "user" | "assistant"; content: string };
type LogEntry = { role: "user" | "assistant"; text: string };

export function RitEditChat({
  model,
  onModelChange,
}: {
  model: DrawingModel;
  onModelChange: (next: DrawingModel) => void;
}) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setError(null);
    setLog((prev) => [...prev, { role: "user", text: trimmed }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/projekt/rit-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, instruction: trimmed, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Något gick fel.");
        return;
      }

      const result = data as RitEditResult & { raw: string };
      setLog((prev) => [...prev, { role: "assistant", text: result.message }]);

      // Prefer the model's own raw turn (verified live during NL-2 that
      // this is what actually keeps a clarification round-trip
      // coherent), but fall back to the friendly message when raw came
      // back empty (a rare transient case, see route.ts) - either way
      // every user turn gets a matching assistant turn, since the
      // Messages API requires roles to alternate.
      const nextHistory = [
        ...history,
        { role: "user" as const, content: trimmed },
        { role: "assistant" as const, content: result.raw.trim() || result.message },
      ].slice(-MAX_RIT_EDIT_HISTORY);
      setHistory(nextHistory);

      if (result.status === "ok") {
        const { model: nextModel, note } = applyRitEdit(model, result.edit);
        onModelChange(nextModel);
        if (note) {
          setLog((prev) => [...prev, { role: "assistant", text: note }]);
        }
      }
    } catch {
      setError("Kunde inte nå servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <p className="mb-2 text-xs font-medium text-foreground/60">Ändra med text</p>
      {log.length > 0 && (
        <div className="mb-2 flex max-h-48 flex-col gap-2 overflow-y-auto text-sm">
          {log.map((entry, i) =>
            entry.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-xl bg-accent px-3 py-1.5 text-accent-foreground">
                  {entry.text}
                </p>
              </div>
            ) : (
              <p key={i} className="max-w-[92%] rounded-xl bg-muted px-3 py-1.5 text-foreground/80">
                {entry.text}
              </p>
            ),
          )}
        </div>
      )}
      {isLoading && <p className="mb-2 text-xs text-foreground/50">Tolkar…</p>}
      {error && (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1 rounded-full border border-gray-300 bg-background pr-1.5 pl-3 focus-within:border-gray-400"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="T.ex. flytta fönstret på norr 50 cm åt vänster"
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Skicka"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
        >
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
