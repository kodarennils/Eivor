import { createClient } from "@/lib/supabase/server";
import { DIRECTIONS, type Direction } from "@/lib/project-fields";

// User-driven edit/confirm of a facade's AI-interpreted material/color
// (see migration 0007). Unlike /api/projekt/facade-analys (which runs the
// vision call), this never touches the model - it's a direct write, and
// always marks the result confirmed since reaching this endpoint IS the
// user confirming or correcting it.
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

  const { projectId, direction, material, color } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof projectId !== "string" ||
    !projectId ||
    !DIRECTIONS.includes(direction as Direction)
  ) {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  if (typeof material !== "string" || !material.trim() || typeof color !== "string" || !color.trim()) {
    return Response.json({ error: "Material och kulör krävs." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return Response.json({ error: "Hittade inte ärendet." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("project_images")
    .update({ material: material.trim(), color: color.trim(), attributes_confirmed: true })
    .eq("project_id", projectId)
    .eq("direction", direction);
  if (updateError) {
    return Response.json({ error: "Kunde inte spara." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
