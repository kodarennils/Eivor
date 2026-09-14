import { createClient } from "@/lib/supabase/server";
import { analyzeFacadePhoto } from "@/lib/facade-analysis";
import { DIRECTIONS, type Direction } from "@/lib/project-fields";

const IMAGES_BUCKET = "project-images";

// Runs vision analysis on a just-uploaded facade photo and persists the
// result as UNCONFIRMED (see migration 0007) - called right after upload
// so the document panel can show it for the user to confirm or correct,
// rather than the old behaviour of silently re-guessing it from scratch
// on every "Generera ritningar" click and feeding it straight into the
// teknisk beskrivning as if it were already-verified fact.
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
  const direction = (body as { direction?: unknown })?.direction;
  if (
    typeof projectId !== "string" ||
    !projectId ||
    !DIRECTIONS.includes(direction as Direction)
  ) {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const { data: imageRow } = await supabase
    .from("project_images")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("direction", direction)
    .maybeSingle();
  if (!imageRow) {
    return Response.json({ error: "Hittade inget foto för det väderstrecket." }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .download(imageRow.storage_path);
  if (downloadError || !fileBlob) {
    return Response.json({ error: "Kunde inte hämta bilden." }, { status: 500 });
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  let attributes: { material: string; color: string };
  try {
    attributes = await analyzeFacadePhoto(bytes, imageRow.storage_path);
  } catch (error) {
    console.error("Fasadanalys misslyckades:", error);
    return Response.json({ error: "Kunde inte tolka fasaden just nu." }, { status: 502 });
  }

  const { error: updateError } = await supabase
    .from("project_images")
    .update({ material: attributes.material, color: attributes.color, attributes_confirmed: false })
    .eq("project_id", projectId)
    .eq("direction", direction);
  if (updateError) {
    return Response.json({ error: "Kunde inte spara tolkningen." }, { status: 500 });
  }

  return Response.json({ material: attributes.material, color: attributes.color, confirmed: false });
}
