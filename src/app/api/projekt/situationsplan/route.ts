import { createClient } from "@/lib/supabase/server";

const BUCKET = "project-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function numberField(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const projectId = formData.get("projectId");
  const file = formData.get("file");
  const pixelsPerMeter = numberField(formData, "pixelsPerMeter");
  const buildingX = numberField(formData, "buildingX");
  const buildingY = numberField(formData, "buildingY");
  const imageWidth = numberField(formData, "imageWidth");
  const imageHeight = numberField(formData, "imageHeight");

  if (typeof projectId !== "string" || !projectId) {
    return Response.json({ error: "Ärende saknas." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Ingen fil bifogad." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Filen måste vara en bild (JPG/PNG)." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Filen får vara högst 20 MB." }, { status: 400 });
  }
  if (!pixelsPerMeter || pixelsPerMeter <= 0) {
    return Response.json({ error: "Kalibrering saknas eller ogiltig." }, { status: 400 });
  }
  if (buildingX === null || buildingY === null) {
    return Response.json({ error: "Byggnadens position saknas." }, { status: 400 });
  }
  if (!imageWidth || !imageHeight) {
    return Response.json({ error: "Bildens mått saknas." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return Response.json({ error: "Hittade inte ärendet." }, { status: 404 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `${user.id}/${projectId}/situationsplan.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    return Response.json({ error: "Kunde inte spara bilden." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      situationsplan_storage_path: storagePath,
      situationsplan_image_width: imageWidth,
      situationsplan_image_height: imageHeight,
      situationsplan_pixels_per_meter: pixelsPerMeter,
      situationsplan_building_x: buildingX,
      situationsplan_building_y: buildingY,
    })
    .eq("id", projectId);
  if (updateError) {
    return Response.json({ error: "Kunde inte spara kalibreringen." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
