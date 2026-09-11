import { createClient } from "@/lib/supabase/server";
import { generateFloorPlanSVG } from "@/lib/drawing";
import { generateFacadeElevationSVG } from "@/lib/facade-drawing";
import { generateSectionSVG } from "@/lib/section-drawing";
import { generateSituationsplanSVG } from "@/lib/situationsplan-drawing";
import { generateFloorPlanInteriorSVG } from "@/lib/floor-plan-drawing";
import { analyzeFacadePhoto } from "@/lib/facade-analysis";
import { DIRECTIONS, type Direction, type Room } from "@/lib/project-fields";

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
  const widthMeters = Number(answers.widthMeters);
  const depthMeters = Number(answers.depthMeters);
  const heightMeters = Number(answers.heightMeters);
  const propertyDesignation = (answers.propertyDesignation as string) || undefined;

  const rooms = Array.isArray(answers.rooms) ? (answers.rooms as Room[]) : [];
  const windowsPerDirectionAnswers = (answers.windowsPerDirection ?? {}) as Partial<
    Record<Direction, string>
  >;
  const mainEntranceDirection = DIRECTIONS.includes(answers.mainEntranceDirection as Direction)
    ? (answers.mainEntranceDirection as Direction)
    : undefined;

  if (!widthMeters || !depthMeters) {
    return Response.json(
      { error: "Bredd och djup måste anges i formuläret innan en ritning kan genereras." },
      { status: 422 },
    );
  }
  if (!heightMeters) {
    return Response.json(
      { error: "Nockhöjd måste anges i formuläret innan fasadritningar och sektion kan genereras." },
      { status: 422 },
    );
  }

  const { data: imageRows } = await supabase
    .from("project_images")
    .select("direction, storage_path")
    .eq("project_id", projectId);

  const facadeAttributes: Partial<Record<Direction, { material: string; color: string }>> = {};

  await Promise.all(
    (imageRows ?? []).map(async (row) => {
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from(IMAGES_BUCKET)
        .download(row.storage_path);
      if (downloadError || !fileBlob) {
        console.error(`Kunde inte hämta bild för ${row.direction} (${row.storage_path}):`, downloadError);
        return;
      }

      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      try {
        facadeAttributes[row.direction as Direction] = await analyzeFacadePhoto(
          bytes,
          row.storage_path,
        );
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
      .filter((room) => room.type && Number(room.percentage) > 0)
      .map((room) => ({ type: room.type, fraction: Number(room.percentage) })),
    windowsPerDirection: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, Number(windowsPerDirectionAnswers[direction]) || 0]),
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
      const distanceToBoundaryMeters = Number(answers.distanceToBoundaryMeters);

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
