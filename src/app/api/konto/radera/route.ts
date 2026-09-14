import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BUCKETS = ["project-images", "project-documents"];

export async function POST() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Servern saknar konfiguration (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Inte inloggad." }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Facade photos and documents are stored under <user_id>/<project_id>/...,
  // so every case's files live in one folder we can list recursively and
  // remove in one pass. Best-effort: a failure here doesn't block account
  // deletion, it just leaves orphaned storage objects behind.
  for (const bucket of BUCKETS) {
    const { data: projectFolders } = await admin.storage.from(bucket).list(user.id);
    const paths: string[] = [];
    for (const folder of projectFolders ?? []) {
      const { data: files } = await admin.storage.from(bucket).list(`${user.id}/${folder.name}`);
      for (const file of files ?? []) {
        paths.push(`${user.id}/${folder.name}/${file.name}`);
      }
    }
    if (paths.length > 0) {
      await admin.storage.from(bucket).remove(paths);
    }
  }

  // Deleting the auth user cascades to projects (and from there to
  // project_answers/project_images) via the existing "on delete cascade"
  // foreign keys - no separate table cleanup needed.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Kunde inte radera kontot:", error);
    return Response.json({ error: "Kunde inte radera kontot. Försök igen." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
