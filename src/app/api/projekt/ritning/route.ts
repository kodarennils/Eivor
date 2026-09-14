import { createClient } from "@/lib/supabase/server";
import { generateFloorPlanSVG } from "@/lib/drawing";
import { generateFacadeElevationSVG } from "@/lib/facade-drawing";
import { generateSectionSVG } from "@/lib/section-drawing";
import { generateSituationsplanSVG } from "@/lib/situationsplan-drawing";
import { generateFloorPlanInteriorSVG } from "@/lib/floor-plan-drawing";
import { analyzeFacadePhoto } from "@/lib/facade-analysis";
import { DIRECTIONS, type Direction, type Room } from "@/lib/project-fields";
import { parseSwedishNumber } from "@/lib/swedish-number";
import { checkDrawingReadiness } from "@/lib/interview";

const IMAGES_BUCKET = "project-images";
const DOCUMENTS_BUCKET = "project-documents";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const projectId = (body as { projectId?: unknown })?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    return Response.json({ error: "Ärende saknas." }, { status: 400 });
  }

  const { data: answerRow } = await supabase
    .from("project_answers")
    .select("answers")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data: projectRow } = await supabase
    .from("projects")
    .select(
      "situationsplan_storage_path, situationsplan_image_width, situationsplan_image_height, situationsplan_pixels_per_meter, situationsplan_building_x, situationsplan_building_y",
    )
    .eq("id", projectId)
    .maybeSingle();

  const answers = (answerRow?.answers ?? {}) as Record<string, unknown>;
  const widthMeters = parseSwedishNumber(answers.widthMeters);
  const depthMeters = parseSwedishNumber(answers.depthMeters);
  const heightMeters = parseSwedishNumber(answers.heightMeters);
  const propertyDesignation = (answers.propertyDesignation as string) || undefined;

  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirectionAnswers = (answers.windowsPerDirection ?? {}) as Partial<
    Record<Direction, string>
  >;
  // mainEntranceDirection is one of interview.ts's ENUM_FIELDS now (a
  // case-insensitively matched, canonical-casing-normalized value at
  // extraction time) - this can trust it's already exactly one of
  // DIRECTIONS' values, or absent. See interview.ts for the live-
  // observed casing bug ("Söder" vs "söder") that used to require a
  // local .toLowerCase() workaround here.
  const mainEntranceDirection = DIRECTIONS.includes(answers.mainEntranceDirection as Direction)
    ? (answers.mainEntranceDirection as Direction)
    : undefined;

  // Shared with the interview's skip-ahead check (checkDrawingReadiness)
  // so "is there enough to jump straight to drawings" and "will this
  // request actually succeed" can never disagree with each other.
  const readiness = checkDrawingReadiness(answers);
  if (!readiness.ready) {
    const missingDimensions = readiness.missing.some((m) => m === "bredd" || m === "djup");
    return Response.json(
      {
        error: missingDimensions
          ? "Bredd och djup måste anges i formuläret innan en ritning kan genereras."
          : "Nockhöjd måste anges i formuläret innan fasadritningar och sektion kan genereras.",
      },
      { status: 422 },
    );
  }

  const { data: imageRows } = await supabase
    .from("project_images")
    .select("direction, storage_path, material, color")
    .eq("project_id", projectId);

  // Material/color is analyzed once, right after upload (see
  // /api/projekt/facade-analys), and can be edited/confirmed from the
  // document panel - both write to project_images. Re-running vision here
  // on every "Generera ritningar" click would silently discard whatever
  // the user confirmed or corrected, so this only falls back to a fresh
  // analysis for a row that somehow never got one (e.g. the earlier
  // analysis call failed).
  const facadeAttributes: Partial<Record<Direction, { material: string; color: string }>> = {};

  await Promise.all(
    (imageRows ?? []).map(async (row) => {
      if (row.material && row.color) {
        facadeAttributes[row.direction as Direction] = { material: row.material, color: row.color };
        return;
      }

      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from(IMAGES_BUCKET)
        .download(row.storage_path);
      if (downloadError || !fileBlob) {
        console.error(`Kunde inte hämta bild för ${row.direction} (${row.storage_path}):`, downloadError);
        return;
      }

      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      try {
        const attributes = await analyzeFacadePhoto(bytes, row.storage_path);
        facadeAttributes[row.direction as Direction] = attributes;
        await supabase
          .from("project_images")
          .update({ material: attributes.material, color: attributes.color, attributes_confirmed: false })
          .eq("project_id", projectId)
          .eq("direction", row.direction);
      } catch (error) {
        console.error(`Fasadanalys misslyckades för ${row.direction}:`, error);
      }
    }),
  );

  const plan = generateFloorPlanSVG({
    widthMeters,
    depthMeters,
    heightMeters,
    propertyDesignation,
    facadeAttributes,
  });

  const elevations = Object.fromEntries(
    DIRECTIONS.map((direction) => [
      direction,
      generateFacadeElevationSVG({
        direction,
        widthMeters,
        depthMeters,
        heightMeters,
        propertyDesignation,
        facadeAttributes: facadeAttributes[direction],
      }),
    ]),
  ) as Record<Direction, string>;

  const section = generateSectionSVG({ depthMeters, heightMeters, propertyDesignation });

  const floorPlan = generateFloorPlanInteriorSVG({
    widthMeters,
    depthMeters,
    rooms: rooms
      .filter((room) => room.type && parseSwedishNumber(room.percentage) > 0)
      .map((room) => ({ type: room.type, fraction: parseSwedishNumber(room.percentage) })),
    windowsPerDirection: Object.fromEntries(
      DIRECTIONS.map((direction) => [
        direction,
        parseSwedishNumber(windowsPerDirectionAnswers[direction]) || 0,
      ]),
    ) as Partial<Record<Direction, number>>,
    mainEntranceDirection,
    propertyDesignation,
  });

  let situationsplan: string | null = null;
  if (
    projectRow?.situationsplan_storage_path &&
    projectRow.situationsplan_image_width &&
    projectRow.situationsplan_image_height &&
    projectRow.situationsplan_pixels_per_meter
  ) {
    const { data: mapBlob, error: mapDownloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(projectRow.situationsplan_storage_path);

    if (mapDownloadError || !mapBlob) {
      console.error("Kunde inte hämta situationsplanens karta:", mapDownloadError);
    } else {
      const extension = projectRow.situationsplan_storage_path.split(".").pop()?.toLowerCase();
      const mimeType = MIME_BY_EXTENSION[extension ?? ""] ?? "image/jpeg";
      const base64 = Buffer.from(await mapBlob.arrayBuffer()).toString("base64");
      const distanceToBoundaryMeters = parseSwedishNumber(answers.distanceToBoundaryMeters);

      situationsplan = generateSituationsplanSVG({
        mapImageDataUri: `data:${mimeType};base64,${base64}`,
        imageWidth: projectRow.situationsplan_image_width,
        imageHeight: projectRow.situationsplan_image_height,
        pixelsPerMeter: projectRow.situationsplan_pixels_per_meter,
        buildingX: projectRow.situationsplan_building_x ?? 0,
        buildingY: projectRow.situationsplan_building_y ?? 0,
        widthMeters,
        depthMeters,
        distanceToBoundaryMeters: Number.isFinite(distanceToBoundaryMeters)
          ? distanceToBoundaryMeters
          : undefined,
        propertyDesignation,
      });
    }
  }

  return Response.json({ plan, elevations, section, floorPlan, situationsplan, facadeAttributes });
}
