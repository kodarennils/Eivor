"use client";

import { useState } from "react";
import { DIRECTIONS, DIRECTION_LABEL, type Direction, type Room } from "@/lib/project-fields";

// Shared editable-field building blocks for structured project_answers
// data. Used by both the document panel (ProjectDocument.tsx) and the
// pre-generation review screen (ReviewScreen.tsx) - one set of components
// so "click to edit width" behaves and looks identical everywhere it
// appears, rather than two hand-maintained copies drifting apart.

export type FacadeAttribute = { material: string; color: string; confirmed: boolean };

export function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-background p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-2 text-xl font-medium">{value || "—"}</p>
    </div>
  );
}

export function withUnit(value: unknown, unit: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return `${value} ${unit}`;
}

// A click-to-edit number field. Saves on blur (or Enter), only when the
// value actually changed and isn't blank - mergeAnswers() never erases a
// known value with an empty one, so an emptied field just reverts rather
// than silently clearing what's saved.
export function EditableMetric({
  label,
  unit,
  value,
  onSave,
}: {
  label: string;
  unit: string;
  value?: string;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (value ?? "")) {
      setDraft(value ?? "");
      return;
    }
    setStatus("saving");
    const ok = await onSave(trimmed);
    if (!ok) {
      setDraft(value ?? "");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1200);
  }

  return (
    <div className="bg-background p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className="w-full min-w-0 rounded-md border-0 bg-transparent text-xl font-medium outline-none focus:bg-muted focus:ring-1 focus:ring-accent"
        />
        <span className="shrink-0 text-sm text-foreground/40">{unit}</span>
      </div>
      <p className="mt-1 h-3 text-[11px] text-foreground/40">
        {status === "saving" && "Sparar…"}
        {status === "error" && <span className="text-red-600">Kunde inte spara</span>}
      </p>
    </div>
  );
}

export function EditableChoice({
  options,
  value,
  onSave,
}: {
  options: readonly string[];
  value?: string;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function choose(option: string) {
    if (option === value || saving) return;
    setSaving(option);
    await onSave(option);
    setSaving(null);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          disabled={saving !== null}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
            value === option
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border hover:border-accent"
          }`}
        >
          {saving === option ? "Sparar…" : option}
        </button>
      ))}
    </div>
  );
}

export function EditableRooms({
  rooms,
  onSave,
}: {
  rooms: Room[];
  onSave: (rooms: Room[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Room[]>(rooms);

  function updateRow(index: number, patch: Partial<Room>) {
    setDraft((prev) => prev.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  }

  async function commit(next: Room[]) {
    const cleaned = next.filter((room) => room.type.trim());
    if (cleaned.length) await onSave(cleaned);
  }

  function addRow() {
    setDraft((prev) => [...prev, { type: "", percentage: "" }]);
  }

  async function removeRow(index: number) {
    const next = draft.filter((_, i) => i !== index);
    setDraft(next);
    await commit(next);
  }

  if (draft.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground/40">Inväntar beskrivning i chatten</p>
        <button type="button" onClick={addRow} className="text-xs font-medium text-accent hover:underline">
          + Lägg till rum
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {draft.map((room, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={room.type}
            onChange={(e) => updateRow(index, { type: e.target.value })}
            onBlur={() => commit(draft)}
            placeholder="Rum"
            className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex shrink-0 items-center gap-1">
            <input
              value={room.percentage}
              onChange={(e) => updateRow(index, { percentage: e.target.value })}
              onBlur={() => commit(draft)}
              placeholder="%"
              className="w-14 rounded-lg border border-border px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
            />
            <span className="text-xs text-foreground/40">%</span>
          </div>
          <button
            type="button"
            onClick={() => removeRow(index)}
            aria-label={`Ta bort ${room.type || "rum"}`}
            className="shrink-0 px-1 text-foreground/40 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs font-medium text-accent hover:underline">
        + Lägg till rum
      </button>
    </div>
  );
}

export function EditableWindows({
  windows,
  onSave,
}: {
  windows: Partial<Record<Direction, string>>;
  onSave: (direction: Direction, value: string) => Promise<boolean>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {DIRECTIONS.map((direction) => (
        <WindowInput
          key={`${direction}-${windows[direction] ?? ""}`}
          direction={direction}
          value={windows[direction]}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

function WindowInput({
  direction,
  value,
  onSave,
}: {
  direction: Direction;
  value?: string;
  onSave: (direction: Direction, value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (value ?? "")) {
      setDraft(value ?? "");
      return;
    }
    await onSave(direction, trimmed);
  }

  return (
    <label className="rounded-lg border border-border p-2.5 text-center">
      <span className="block text-xs text-foreground/50">{DIRECTION_LABEL[direction]}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="0"
        className="mt-1 w-full rounded-md border-0 bg-transparent text-center text-lg font-medium outline-none focus:bg-muted focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}

// AI-interpreted facade material/color is shown here as an explicitly
// unsettled fact ("AI-tolkat, bekräfta eller ändra") until the user edits
// or confirms it - it never silently becomes final. Confirming always
// writes attributes_confirmed:true, which /api/projekt/ritning then uses
// as-is instead of re-running the vision call.
export function FacadeAttributeRow({
  projectId,
  direction,
  attribute,
  onChange,
}: {
  projectId: string;
  direction: Direction;
  attribute?: FacadeAttribute;
  onChange: (direction: Direction, attribute: FacadeAttribute) => void;
}) {
  const [material, setMaterial] = useState(attribute?.material ?? "");
  const [color, setColor] = useState(attribute?.color ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!material.trim() || !color.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projekt/facade-attribut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, direction, material: material.trim(), color: color.trim() }),
      });
      if (!res.ok) {
        setError("Kunde inte spara.");
        return;
      }
      onChange(direction, { material: material.trim(), color: color.trim(), confirmed: true });
    } catch {
      setError("Kunde inte nå servern.");
    } finally {
      setSaving(false);
    }
  }

  if (!attribute) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3 text-sm text-foreground/50">
        {DIRECTION_LABEL[direction]}: analyserar fasaden…
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 ${attribute.confirmed ? "border-border" : "border-amber-300 bg-amber-50"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{DIRECTION_LABEL[direction]}</span>
        {attribute.confirmed ? (
          <span className="text-xs text-foreground/40">Bekräftat</span>
        ) : (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            AI-tolkat, bekräfta eller ändra
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Material"
          className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Kulör"
          className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? "Sparar…" : attribute.confirmed ? "Uppdatera" : "Bekräfta"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
