import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "project-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20_000;

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

  if (typeof projectId !== "string" || !projectId) {
    return Response.json({ error: "Ärende saknas." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Ingen fil bifogad." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json({ error: "Filen måste vara en PDF." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Filen får vara högst 20 MB." }, { status: 400 });
  }

  // RLS also protects this, but check explicitly for a clean error message.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return Response.json({ error: "Hittade inte ärendet." }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let text: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(result.text) ? result.text.join("\n") : result.text).trim();
  } catch (error) {
    console.error("PDF-extraktion misslyckades:", error);
    return Response.json(
      { error: "Kunde inte läsa text ur PDF-filen. Är den skannad som en bild?" },
      { status: 422 },
    );
  }

  if (!text) {
    return Response.json(
      { error: "Hittade ingen text i PDF-filen. Är den skannad som en bild?" },
      { status: 422 },
    );
  }

  const truncated = text.length > MAX_TEXT_LENGTH;
  const storagePath = `${user.id}/${projectId}/detaljplan.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return Response.json({ error: "Kunde inte spara filen." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      detaljplan_storage_path: storagePath,
      detaljplan_text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
    })
    .eq("id", projectId);
  if (updateError) {
    return Response.json({ error: "Kunde inte spara texten." }, { status: 500 });
  }

  return Response.json({ ok: true, characters: text.length, truncated });
}
