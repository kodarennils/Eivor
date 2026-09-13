import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@/lib/project-fields";
import { VERDICT_LABEL, VERDICT_STYLE, type Verdict } from "@/lib/verdict";

type Assessment = { verdict?: Verdict; summary?: string } | null;

export function ProjectDocument({
  answers,
  photos,
  detaljplanUploaded,
  situationsplanUploaded,
  assessment,
}: {
  answers: Record<string, unknown>;
  photos: Partial<Record<Direction, string>>;
  detaljplanUploaded: boolean;
  situationsplanUploaded: boolean;
  assessment: Assessment;
}) {
  const rooms = Array.isArray(answers.rooms)
    ? (answers.rooms as { type: string; percentage: string }[])
    : [];
  const windows = (answers.windowsPerDirection ?? {}) as Partial<Record<Direction, string>>;
  const mainEntrance = answers.mainEntranceDirection as Direction | undefined;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Ärendedokument</h1>
        <p className="mt-1 text-sm text-foreground/50">
          Uppdateras automatiskt utifrån vad som sägs i chatten.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeading>Om projektet</SectionHeading>
        <div className="divide-y divide-border rounded-lg border border-border px-4">
          <Field label="Typ av åtgärd" value={answers.projectType as string} />
          <Field label="Beskrivning" value={answers.description as string} />
          <Field label="Fastighetsbeteckning" value={answers.propertyDesignation as string} />
          <Field label="Inom detaljplanerat område" value={answers.withinDetailedPlan as string} />
        </div>

        {rooms.length > 0 && (
          <div className="mt-2 rounded-lg border border-border px-4 py-3">
            <p className="pb-1 text-xs font-medium text-foreground/50">Rumsindelning</p>
            <ul className="flex flex-col gap-1 text-sm">
              {rooms.map((room, i) => (
                <li key={i} className="flex justify-between">
                  <span>{room.type}</span>
                  <span className="text-foreground/70">{room.percentage}%</span>
                </li>
              ))}
            </ul>
            {(mainEntrance || Object.keys(windows).length > 0) && (
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs text-foreground/70">
                {mainEntrance && <p>Huvudentré: {DIRECTION_LABEL[mainEntrance]}</p>}
                {Object.keys(windows).length > 0 && (
                  <p>
                    Fönster:{" "}
                    {DIRECTIONS.filter((d) => windows[d])
                      .map((d) => `${DIRECTION_LABEL[d]} ${windows[d]}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Mått</SectionHeading>
        <div className="divide-y divide-border rounded-lg border border-border px-4">
          <Field label="Bredd" value={withUnit(answers.widthMeters, "m")} />
          <Field label="Djup" value={withUnit(answers.depthMeters, "m")} />
          <Field label="Yta" value={withUnit(answers.areaSqm, "kvm")} />
          <Field label="Höjd till nock" value={withUnit(answers.heightMeters, "m")} />
          <Field
            label="Avstånd till tomtgräns"
            value={withUnit(answers.distanceToBoundaryMeters, "m")}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Bilagor</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          {DIRECTIONS.map((direction) => (
            <div key={direction} className="flex flex-col gap-1">
              <span className="text-xs text-foreground/50">
                Fasad {DIRECTION_LABEL[direction].toLowerCase()}
              </span>
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {photos[direction] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photos[direction]}
                    alt={`Fasad mot ${DIRECTION_LABEL[direction].toLowerCase()}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-foreground/30">Saknas</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-foreground/50">Situationsplan</span>
            <span className={situationsplanUploaded ? "font-medium" : "text-foreground/30"}>
              {situationsplanUploaded ? "Uppladdad" : "Saknas"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground/50">Detaljplan</span>
            <span className={detaljplanUploaded ? "font-medium" : "text-foreground/30"}>
              {detaljplanUploaded ? "Uppladdad" : "Saknas"}
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Bedömning</SectionHeading>
        {assessment?.verdict ? (
          <div className={`rounded-lg border px-4 py-3 text-sm ${VERDICT_STYLE[assessment.verdict]}`}>
            <p className="font-medium">{VERDICT_LABEL[assessment.verdict]}</p>
            {assessment.summary && <p className="mt-1 opacity-80">{assessment.summary}</p>}
          </div>
        ) : (
          <p className="rounded-lg border border-border px-4 py-3 text-sm text-foreground/30">
            Ingen bedömning ännu.
          </p>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
      {children}
    </h2>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-foreground/50">{label}</span>
      <span className={value ? "font-medium text-foreground" : "text-foreground/30"}>
        {value || "—"}
      </span>
    </div>
  );
}

function withUnit(value: unknown, unit: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return `${value} ${unit}`;
}
