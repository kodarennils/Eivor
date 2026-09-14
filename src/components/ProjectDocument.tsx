"use client";

import { useState } from "react";
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
import type { GeneratedDrawings } from "@/lib/generated-drawings";
import type { KontrollplanPunkt } from "@/app/api/projekt/kontrollplan/route";
import type { TekniskBeskrivning } from "@/lib/teknisk-beskrivning";
import { buildDrawingModelFromAnswers } from "@/lib/drawing-schema-from-answers";
import type { DrawingModel } from "@/lib/drawing-schema";
import { DrawingModelEditor } from "@/components/DrawingModelEditor";
import { RitEditChat } from "@/components/RitEditChat";
import { computeOverviewSectionsPresence, computeOverviewFieldPresence } from "@/lib/overview-sections";

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
  generatedDrawings,
  editedDrawingModel,
  onEditedDrawingModelChange,
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
  generatedDrawings: GeneratedDrawings | null;
  editedDrawingModel: DrawingModel | null;
  onEditedDrawingModelChange: (next: DrawingModel | null) => void;
  onAnswersChange: (next: Record<string, unknown>) => void;
  onFacadeAttributeChange: (direction: Direction, attribute: FacadeAttribute) => void;
}) {
  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirection = (answers.windowsPerDirection ?? {}) as Partial<
    Record<Direction, string>
  >;

  const titleLine1 = (answers.projectType as string) || "Ditt ärende";
  const titleLine2 = answers.propertyDesignation as string | undefined;

  // A section only renders once it has at least one real value - see
  // lib/overview-sections.ts. page.tsx computes the same presence to
  // decide whether to render this panel at all (fullwidth chat
  // otherwise), so the two can't disagree about what counts as content.
  const presence = computeOverviewSectionsPresence({
    answers,
    photos,
    assessment,
    generatedDrawings,
    editedDrawingModel,
    detaljplanUploaded,
    situationsplanUploaded,
  });
  // Om projektet/Mått each bundle several independent fields under one
  // section gate - fieldPresence lets each one render only once IT
  // specifically has a value, instead of the whole section revealing
  // every field (including untouched ones) as soon as any one of them does.
  const fieldPresence = computeOverviewFieldPresence(answers);
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

      {presence.omProjektet && (
        <DocumentSection title="Om projektet" icon={BuildingIcon}>
          {/* Each of these 4 blocks renders only once IT specifically has
              a value (fieldPresence), not just because presence.omProjektet
              (the OR of all 4) is true - otherwise every field would
              reveal itself the moment any ONE of them got answered. All 4
              share the same "border-b ... last:border-0" pattern instead
              of a hardcoded border-b/border-t sequence, so whichever
              subset actually renders still gets correct dividers between
              them via CSS :last-child - no combinatorial JS needed. */}
          {fieldPresence.projectType && (
            <Field
              label="Typ av åtgärd"
              value={answers.projectType as string}
              placeholder="Inväntar beskrivning i chatten"
            />
          )}

          {fieldPresence.withinDetailedPlan && (
            <div className="border-b border-border py-3 text-sm last:border-0">
              <span className="text-foreground/50">Detaljplan</span>
              <div className="mt-2">
                <EditableChoice
                  options={YES_NO_UNKNOWN_OPTIONS}
                  value={answers.withinDetailedPlan as string | undefined}
                  onSave={(value) => saveAnswers({ withinDetailedPlan: value })}
                />
              </div>
            </div>
          )}

          {fieldPresence.rooms && (
            <div className="border-b border-border py-3 text-sm last:border-0">
              <span className="text-foreground/50">Rumsindelning</span>
              <div className="mt-2">
                <EditableRooms
                  key={JSON.stringify(rooms)}
                  rooms={rooms}
                  onSave={(next) => saveAnswers({ rooms: next })}
                />
              </div>
            </div>
          )}

          {fieldPresence.windowsPerDirection && (
            <div className="border-b border-border py-3 text-sm last:border-0">
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
          )}
        </DocumentSection>
      )}

      {presence.matt && (
        <DocumentSection title="Mått" icon={RulerIcon}>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {fieldPresence.widthMeters && (
              <EditableMetric
                key={`width-${answers.widthMeters ?? ""}`}
                label="Bredd"
                unit="m"
                value={answers.widthMeters as string | undefined}
                onSave={(value) => saveAnswers({ widthMeters: value })}
              />
            )}
            {fieldPresence.depthMeters && (
              <EditableMetric
                key={`depth-${answers.depthMeters ?? ""}`}
                label="Djup"
                unit="m"
                value={answers.depthMeters as string | undefined}
                onSave={(value) => saveAnswers({ depthMeters: value })}
              />
            )}
            {fieldPresence.areaSqm && (
              <Metric label="Byggnadsarea" value={withUnit(answers.areaSqm, "m²")} />
            )}
            {fieldPresence.heightMeters && (
              <EditableMetric
                key={`height-${answers.heightMeters ?? ""}`}
                label="Höjd till nock"
                unit="m"
                value={answers.heightMeters as string | undefined}
                onSave={(value) => saveAnswers({ heightMeters: value })}
              />
            )}
            {fieldPresence.distanceToBoundaryMeters && (
              <EditableMetric
                key={`boundary-${answers.distanceToBoundaryMeters ?? ""}`}
                label="Till tomtgräns"
                unit="m"
                value={answers.distanceToBoundaryMeters as string | undefined}
                onSave={(value) => saveAnswers({ distanceToBoundaryMeters: value })}
              />
            )}
          </div>
        </DocumentSection>
      )}

      {/* assessment?.verdict, not presence.bedomning, is the actual
          narrowing condition here (they're exactly equivalent by
          construction - see computeOverviewSectionsPresence - but this
          way TypeScript knows assessment.verdict is defined below
          without a non-null assertion). presence.bedomning is what
          page.tsx uses for the outer fullwidth-vs-split decision. */}
      {assessment?.verdict && (
        <DocumentSection title="Bedömning" icon={FileTextIcon}>
          <div className="border-l-2 border-accent py-1 pl-5">
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
          </div>
        </DocumentSection>
      )}

      {presence.kontrollansvarig && (
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

      {presence.fasadmaterial && (
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

      {presence.ritningar && (
        <RitningarSection
          answers={answers}
          generatedDrawings={generatedDrawings}
          editedModel={editedDrawingModel}
          onEditedModelChange={onEditedDrawingModelChange}
        />
      )}

      {presence.bilagor && (
        <DocumentSection title="Bilagor" icon={PaperclipIcon}>
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
        </DocumentSection>
      )}
    </div>
  );
}

// --- Ritningar --------------------------------------------------------
// Every generated drawing type lives here now - moved out of the chat
// panel, which is pure conversation only and never renders a drawing
// inline. Tabs populate as they become available rather than requiring
// everything to be generated before anything shows:
//   - "Redigera" (the structured-schema Konva editor) is available as
//     soon as width/depth/height are known - it's a pure client-side
//     computation (buildDrawingModelFromAnswers), no generation step or
//     API call needed, so it's typically available well before the
//     static drawings are ever requested. It's the default view once
//     available, per how this was scoped.
//   - The static SVG drawings (facades/plan/section/situationsplan) and
//     Kontrollplan/Teknisk beskrivning populate together once "Generera
//     ritningar" completes, since /api/projekt/ritning + /api/projekt/
//     kontrollplan already return everything in one round trip each
//     (this session's own load-testing showed ritning resolving in
//     ~1.5s - not slow enough to justify splitting into N separate calls
//     right now). The tab STATE is still keyed per drawing type, so if
//     generation is ever split into independent calls later, each tab
//     can start populating on its own without any change here.
type RitningTab =
  | "redigera"
  | "fasad-norr"
  | "fasad-öster"
  | "fasad-söder"
  | "fasad-väster"
  | "volym"
  | "planritning"
  | "sektion"
  | "situationsplan"
  | "kontrollplan"
  | "teknisk-beskrivning";

function RitningarSection({
  answers,
  generatedDrawings,
  editedModel,
  onEditedModelChange,
}: {
  answers: Record<string, unknown>;
  generatedDrawings: GeneratedDrawings | null;
  editedModel: DrawingModel | null;
  onEditedModelChange: (next: DrawingModel | null) => void;
}) {
  const liveDrawingModel = buildDrawingModelFromAnswers(answers);
  // editedModel is now lifted to page.tsx (NL-1) so the future NL-4
  // edit-input component can read/write the same model this canvas/form
  // does. Behavior is unchanged: until the user edits anything here, the
  // freshly-computed model above is used directly so it keeps following
  // live answers changes elsewhere in the app; once edited, it "locks
  // in" and stops following further answers changes - same
  // not-yet-persisted, session-local behavior this editor already had
  // before the relocation.
  const drawingModel = editedModel ?? liveDrawingModel;

  const tabs: { key: RitningTab; label: string }[] = [];
  if (drawingModel) tabs.push({ key: "redigera", label: "Redigera" });
  if (generatedDrawings) {
    for (const direction of DIRECTIONS) {
      tabs.push({ key: `fasad-${direction}` as RitningTab, label: `Fasad ${DIRECTION_LABEL[direction]}` });
    }
    tabs.push({ key: "volym", label: "Volymritning" });
    tabs.push({ key: "planritning", label: "Planritning" });
    tabs.push({ key: "sektion", label: "Sektion" });
    if (generatedDrawings.situationsplan) tabs.push({ key: "situationsplan", label: "Situationsplan" });
    tabs.push({ key: "kontrollplan", label: "Kontrollplan" });
    tabs.push({ key: "teknisk-beskrivning", label: "Teknisk beskrivning" });
  }

  const [selectedTab, setSelectedTab] = useState<RitningTab | null>(null);
  const activeTab = tabs.some((t) => t.key === selectedTab) ? selectedTab : (tabs[0]?.key ?? null);

  // The parent only renders this component at all once presence.ritningar
  // is true (lib/overview-sections.ts - the exact same "editedModel ??
  // live-from-answers, or generatedDrawings" check as drawingModel/tabs
  // above), so tabs is guaranteed non-empty here - no placeholder-only
  // empty state to render, per the same rule every other section follows.
  return (
    <DocumentSection title="Ritningar" icon={RulerIcon}>
      {/* flex-nowrap + overflow-x-auto, not flex-wrap: the tab count
          grows from 1 (just "Redigera", pre-generation) to 9
          (+ Fasad x4/Volymritning/Planritning/Sektion/Kontrollplan/
          Teknisk beskrivning, once generated) - a single horizontally-
          scrollable row keeps that growth from ever wrapping to a
          second line, so it stays visually the same "tab row" the
          whole time instead of reflowing as more tabs are added. */}
      <div className="mb-4 flex flex-nowrap gap-1.5 overflow-x-auto border-b border-border pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSelectedTab(tab.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground/60 hover:border-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "redigera" && drawingModel && (
        <div>
          <p className="mb-3 text-xs text-foreground/50">
            Dra fönster/dörrar, skriv värden i panelen, eller beskriv ändringen med text
            nedan. Rörelse är låst till väggens egen riktning och klipps så att
            fönstret/dörren aldrig kan sticka ut utanför väggen. Sparas inte ännu - bara
            lokalt i den här vyn.
          </p>
          <DrawingModelEditor model={drawingModel} onModelChange={onEditedModelChange} />
          <div className="mt-4">
            <RitEditChat model={drawingModel} onModelChange={onEditedModelChange} />
          </div>
        </div>
      )}
      {activeTab?.startsWith("fasad-") && generatedDrawings && (
        <DrawingCard
          svg={generatedDrawings.elevations[activeTab.replace("fasad-", "") as Direction]}
        />
      )}
      {activeTab === "volym" && generatedDrawings && <DrawingCard svg={generatedDrawings.plan} />}
      {activeTab === "planritning" && generatedDrawings && (
        <DrawingCard svg={generatedDrawings.floorPlan} />
      )}
      {activeTab === "sektion" && generatedDrawings && <DrawingCard svg={generatedDrawings.section} />}
      {activeTab === "situationsplan" && generatedDrawings?.situationsplan && (
        <DrawingCard svg={generatedDrawings.situationsplan} />
      )}
      {activeTab === "kontrollplan" && generatedDrawings && (
        <KontrollplanCard
          punkter={generatedDrawings.kontrollplan}
          error={generatedDrawings.kontrollplanError}
        />
      )}
      {activeTab === "teknisk-beskrivning" && generatedDrawings && (
        <TekniskBeskrivningCard data={generatedDrawings.tekniskBeskrivning} />
      )}
    </DocumentSection>
  );
}

function KontrollplanCard({
  punkter,
  error,
}: {
  punkter: KontrollplanPunkt[];
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-foreground/50">
                  <th className="py-2 pr-3 font-medium">Kontrollpunkt</th>
                  <th className="py-2 pr-3 font-medium">Utförs av</th>
                  <th className="py-2 font-medium">När</th>
                </tr>
              </thead>
              <tbody>
                {punkter.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{p.kontrollpunkt}</td>
                    <td className="py-2 pr-3 text-foreground/70">{p.utforsAv}</td>
                    <td className="py-2 text-foreground/70">{p.nar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-foreground/60">
            Detta är ett förslag till kontrollplan baserat på ditt ärende. Det ska granskas
            och fastställas tillsammans med din kontrollansvarig och/eller byggnadsnämnden.
          </p>
        </>
      )}
    </div>
  );
}

function TekniskBeskrivningCard({ data }: { data: TekniskBeskrivning }) {
  const rows: [string, string][] = [
    ["Grundläggning", data.grundlaggning],
    ["Stomme / fasadmaterial", data.stomme],
    ["Ventilation", data.ventilation],
    ["Uppvärmning", data.uppvarmning],
  ];

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2">
            <span className="text-foreground/60">{label}</span>
            <span className={value === "Ej angivet" ? "text-foreground/40" : "font-medium"}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawingCard({ svg }: { svg: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white p-4" dangerouslySetInnerHTML={{ __html: svg }} />
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
