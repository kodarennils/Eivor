"use client";

import { DIRECTIONS, YES_NO_UNKNOWN_OPTIONS, type Direction, type Room } from "@/lib/project-fields";
import { saveProjectAnswers } from "@/lib/save-answers-client";
import {
  Metric,
  EditableMetric,
  EditableChoice,
  EditableRooms,
  EditableWindows,
  FacadeAttributeRow,
  withUnit,
  type FacadeAttribute,
} from "@/components/editable-answer-fields";

// Shown instead of a bare "Generera ritningar" button once the interview
// signals done:true. Reuses the exact same editable-field components as
// the document panel (editable-answer-fields.tsx) - a chat summary bullet
// list can't be corrected, this can, without the user having to scroll
// back through the conversation to find where something went wrong.
export function ReviewScreen({
  projectId,
  answers,
  photos,
  facadeAttributes,
  onAnswersChange,
  onFacadeAttributeChange,
  onGenerate,
  isGenerating,
  error,
}: {
  projectId: string;
  answers: Record<string, unknown>;
  photos: Partial<Record<Direction, string>>;
  facadeAttributes: Partial<Record<Direction, FacadeAttribute>>;
  onAnswersChange: (next: Record<string, unknown>) => void;
  onFacadeAttributeChange: (direction: Direction, attribute: FacadeAttribute) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  error: string | null;
}) {
  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirection = (answers.windowsPerDirection ?? {}) as Partial<
    Record<Direction, string>
  >;
  const uploadedDirections = DIRECTIONS.filter((d) => photos[d]);

  async function saveAnswers(update: Record<string, unknown>): Promise<boolean> {
    const result = await saveProjectAnswers(projectId, update);
    if (!result) return false;
    onAnswersChange(result);
    return true;
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-white p-5">
      <p className="text-xs font-medium tracking-wide text-foreground/50 uppercase">
        Granska innan ritningarna tas fram
      </p>
      <p className="mt-1 text-sm text-foreground/60">
        Kontrollera att allt stämmer - du kan ändra direkt här om något behöver rättas.
      </p>

      <div className="mt-5 space-y-6">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] gap-5 text-sm">
          <span className="text-foreground/50">Typ av åtgärd</span>
          <span className="font-medium">{(answers.projectType as string) || "—"}</span>
        </div>

        <div>
          <p className="mb-2 text-xs text-foreground/50">Mått</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            <EditableMetric
              key={`width-${answers.widthMeters ?? ""}`}
              label="Bredd"
              unit="m"
              value={answers.widthMeters as string | undefined}
              onSave={(value) => saveAnswers({ widthMeters: value })}
            />
            <EditableMetric
              key={`depth-${answers.depthMeters ?? ""}`}
              label="Djup"
              unit="m"
              value={answers.depthMeters as string | undefined}
              onSave={(value) => saveAnswers({ depthMeters: value })}
            />
            <Metric label="Byggnadsarea" value={withUnit(answers.areaSqm, "m²")} />
            <EditableMetric
              key={`height-${answers.heightMeters ?? ""}`}
              label="Höjd till nock"
              unit="m"
              value={answers.heightMeters as string | undefined}
              onSave={(value) => saveAnswers({ heightMeters: value })}
            />
            <EditableMetric
              key={`boundary-${answers.distanceToBoundaryMeters ?? ""}`}
              label="Till tomtgräns"
              unit="m"
              value={answers.distanceToBoundaryMeters as string | undefined}
              onSave={(value) => saveAnswers({ distanceToBoundaryMeters: value })}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-foreground/50">Detaljplan</p>
          <EditableChoice
            options={YES_NO_UNKNOWN_OPTIONS}
            value={answers.withinDetailedPlan as string | undefined}
            onSave={(value) => saveAnswers({ withinDetailedPlan: value })}
          />
        </div>

        <div>
          <p className="mb-2 text-xs text-foreground/50">Rumsindelning</p>
          <EditableRooms
            key={JSON.stringify(rooms)}
            rooms={rooms}
            onSave={(next) => saveAnswers({ rooms: next })}
          />
        </div>

        <div>
          <p className="mb-2 text-xs text-foreground/50">Fönster per väderstreck</p>
          <EditableWindows
            windows={windowsPerDirection}
            onSave={(direction, value) =>
              saveAnswers({ windowsPerDirection: { [direction]: value } })
            }
          />
        </div>

        {uploadedDirections.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-foreground/50">Fasadmaterial</p>
            <div className="space-y-3">
              {uploadedDirections.map((direction) => (
                <FacadeAttributeRow
                  key={`${direction}-${facadeAttributes[direction]?.material ?? ""}-${facadeAttributes[direction]?.color ?? ""}-${facadeAttributes[direction]?.confirmed ?? ""}`}
                  projectId={projectId}
                  direction={direction}
                  attribute={facadeAttributes[direction]}
                  onChange={onFacadeAttributeChange}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className="mt-6 w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
      >
        {isGenerating ? "Genererar…" : "Generera ritningar"}
      </button>
      {error && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
