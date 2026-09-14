"use client";

import {
  BuildingIcon,
  RulerIcon,
  FileTextIcon,
  PaperclipIcon,
  PhotoIcon,
} from "@/components/icons";
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  YES_NO_UNKNOWN_OPTIONS,
  type Direction,
  type Room,
} from "@/lib/project-fields";
import { VERDICT_LABEL, VERDICT_STYLE, type Verdict } from "@/lib/verdict";
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

type Assessment = { verdict?: Verdict; summary?: string } | null;
type IconComponent = (props: { className?: string }) => React.ReactElement;

export function ProjectDocument({
  projectId,
  answers,
  photos,
  facadeAttributes,
  detaljplanUploaded,
  situationsplanUploaded,
  assessment,
  onAnswersChange,
  onFacadeAttributeChange,
}: {
  projectId: string;
  answers: Record<string, unknown>;
  photos: Partial<Record<Direction, string>>;
  facadeAttributes: Partial<Record<Direction, FacadeAttribute>>;
  detaljplanUploaded: boolean;
  situationsplanUploaded: boolean;
  assessment: Assessment;
  onAnswersChange: (next: Record<string, unknown>) => void;
  onFacadeAttributeChange: (direction: Direction, attribute: FacadeAttribute) => void;
}) {
  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirection = (answers.windowsPerDirection ?? {}) as Partial<
    Record<Direction, string>
  >;

  const titleLine1 = (answers.projectType as string) || "Ditt ärende";
  const titleLine2 = answers.propertyDesignation as string | undefined;

  const hasAttachments =
    DIRECTIONS.some((d) => photos[d]) || situationsplanUploaded || detaljplanUploaded;
  const uploadedDirections = DIRECTIONS.filter((d) => photos[d]);

  // Every editable field in this panel writes to the exact same
  // project_answers row the chat writes to (via /api/projekt/answers,
  // which itself calls the same mergeAnswers() the chat's route uses) -
  // a panel edit and a chat answer are just two different ways of
  // producing the same update, so both go through this one function.
  async function saveAnswers(update: Record<string, unknown>): Promise<boolean> {
    const result = await saveProjectAnswers(projectId, update);
    if (!result) return false;
    onAnswersChange(result);
    return true;
  }

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

        <div className="border-b border-border py-3 text-sm">
          <span className="text-foreground/50">Detaljplan</span>
          <div className="mt-2">
            <EditableChoice
              options={YES_NO_UNKNOWN_OPTIONS}
              value={answers.withinDetailedPlan as string | undefined}
              onSave={(value) => saveAnswers({ withinDetailedPlan: value })}
            />
          </div>
        </div>

        <div className="py-3 text-sm">
          <span className="text-foreground/50">Rumsindelning</span>
          <div className="mt-2">
            <EditableRooms
              key={JSON.stringify(rooms)}
              rooms={rooms}
              onSave={(next) => saveAnswers({ rooms: next })}
            />
          </div>
        </div>

        <div className="border-t border-border py-3 text-sm">
          <span className="text-foreground/50">Fönster per väderstreck</span>
          <div className="mt-2">
            <EditableWindows
              windows={windowsPerDirection}
              onSave={(direction, value) =>
                saveAnswers({ windowsPerDirection: { [direction]: value } })
              }
            />
          </div>
        </div>
      </DocumentSection>

      <DocumentSection title="Mått" icon={RulerIcon}>
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

      {answers.requiresKontrollansvarig === "Ja" && (
        <DocumentSection title="Kontrollansvarig" icon={FileTextIcon}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              För det här ärendet krävs troligen en certifierad kontrollansvarig (KA). Du
              behöver utse en och ange deras kontaktuppgifter i din ansökan.
            </p>

            {answers.kontrollansvarigNamn ? (
              <p className="mt-3 text-sm text-amber-900">
                <span className="font-medium">{answers.kontrollansvarigNamn as string}</span>
                {answers.kontrollansvarigKontakt
                  ? ` — ${answers.kontrollansvarigKontakt as string}`
                  : ""}
              </p>
            ) : (
              <p className="mt-3 inline-flex rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Saknas: Kontrollansvarig
              </p>
            )}

            <p className="mt-4 text-xs text-amber-800/80">
              Eivor identifierar behovet av en kontrollansvarig utifrån ärendets uppgifter
              och hjälper dig hålla koll på kontaktuppgifterna. Eivor agerar aldrig som,
              föreslår aldrig en specifik person, och ersätter aldrig en kontrollansvarig.
            </p>
          </div>
        </DocumentSection>
      )}

      {uploadedDirections.length > 0 && (
        <DocumentSection title="Fasadmaterial" icon={PhotoIcon}>
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
        </DocumentSection>
      )}

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
