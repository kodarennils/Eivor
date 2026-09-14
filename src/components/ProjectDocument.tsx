import {
  BuildingIcon,
  RulerIcon,
  FileTextIcon,
  PaperclipIcon,
  PhotoIcon,
} from "@/components/icons";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@/lib/project-fields";
import { VERDICT_LABEL, VERDICT_STYLE, type Verdict } from "@/lib/verdict";

type Assessment = { verdict?: Verdict; summary?: string } | null;
type IconComponent = (props: { className?: string }) => React.ReactElement;

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
  const roomsSummary = rooms.length
    ? rooms.map((room) => `${room.type} ${room.percentage}%`).join(", ")
    : "";

  const titleLine1 = (answers.projectType as string) || "Ditt ärende";
  const titleLine2 = answers.propertyDesignation as string | undefined;

  const hasAttachments =
    DIRECTIONS.some((d) => photos[d]) || situationsplanUploaded || detaljplanUploaded;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-l-2 border-accent pl-5">
        <p className="text-xs font-medium tracking-wide text-foreground/50 uppercase">
          Bygglovsärende
        </p>
        <h2 className="mt-2 text-3xl font-medium sm:text-4xl">
          {titleLine1}
          {titleLine2 && (
            <>
              <br />
              {titleLine2}
            </>
          )}
        </h2>
      </div>

      <DocumentSection title="Om projektet" icon={BuildingIcon}>
        <Field
          label="Typ av åtgärd"
          value={answers.projectType as string}
          placeholder="Inväntar beskrivning i chatten"
        />
        <Field
          label="Rumsindelning"
          value={roomsSummary}
          placeholder="Inväntar beskrivning i chatten"
        />
        <Field
          label="Detaljplan"
          value={answers.withinDetailedPlan as string}
          placeholder="Inväntar svar eller uppladdning"
        />
      </DocumentSection>

      <DocumentSection title="Mått" icon={RulerIcon}>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          <Metric label="Byggnadsarea" value={withUnit(answers.areaSqm, "m²")} />
          <Metric label="Höjd till nock" value={withUnit(answers.heightMeters, "m")} />
          <Metric label="Till tomtgräns" value={withUnit(answers.distanceToBoundaryMeters, "m")} />
        </div>
      </DocumentSection>

      <DocumentSection title="Bedömning" icon={FileTextIcon}>
        <div className="border-l-2 border-accent py-1 pl-5">
          {assessment?.verdict ? (
            <>
              <span
                className={`inline-flex rounded-sm px-2.5 py-1 text-xs font-semibold ${VERDICT_STYLE[assessment.verdict]}`}
              >
                {VERDICT_LABEL[assessment.verdict]}
              </span>
              {assessment.summary && (
                <p className="mt-4 max-w-2xl text-sm leading-6">{assessment.summary}</p>
              )}
              <p className="mt-3 text-xs text-foreground/50">
                Preliminär bedömning · uppdateras när ny information bekräftas
              </p>
            </>
          ) : (
            <p className="text-sm text-foreground/50">
              Inväntar tillräckligt underlag för en bedömning.
            </p>
          )}
        </div>
      </DocumentSection>

      <DocumentSection title="Bilagor" icon={PaperclipIcon}>
        {hasAttachments ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {DIRECTIONS.filter((d) => photos[d]).map((direction) => (
              <AttachmentCard
                key={direction}
                label={`Fasad ${DIRECTION_LABEL[direction].toLowerCase()}`}
                imageUrl={photos[direction]}
              />
            ))}
            {situationsplanUploaded && (
              <AttachmentCard label="Situationsplan" icon={FileTextIcon} />
            )}
            {detaljplanUploaded && <AttachmentCard label="Detaljplan" icon={FileTextIcon} />}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-foreground/50">
            <PhotoIcon className="size-5" /> Inga bilagor ännu
          </div>
        )}
      </DocumentSection>
    </div>
  );
}

function DocumentSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: IconComponent;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-border pt-7">
      <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-4 text-accent" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
}: {
  label: string;
  value?: string;
  placeholder: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] gap-5 border-b border-border py-3 text-sm last:border-0">
      <span className="text-foreground/50">{label}</span>
      <span className={value ? "font-medium" : "font-normal text-foreground/40"}>
        {value || placeholder}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-background p-4">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-2 text-xl font-medium">{value || "—"}</p>
    </div>
  );
}

function AttachmentCard({
  label,
  imageUrl,
  icon: Icon,
}: {
  label: string;
  imageUrl?: string;
  icon?: IconComponent;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={label} className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center bg-muted">
          {Icon && <Icon className="size-8 text-accent" />}
        </div>
      )}
      <p className="truncate border-t border-border px-2.5 py-2 text-xs">{label}</p>
    </div>
  );
}

function withUnit(value: unknown, unit: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return `${value} ${unit}`;
}
