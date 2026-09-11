"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DIRECTION_LABEL, DIRECTION_STORAGE_SLUG, type Direction } from "@/lib/project-fields";

const BUCKET = "project-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ImageUploadSlot({
  userId,
  projectId,
  direction,
  initialStoragePath,
}: {
  userId: string;
  projectId: string;
  direction: Direction;
  initialStoragePath?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialStoragePath) return;
    const supabase = createClient();
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(initialStoragePath, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setPreviewUrl(data.signedUrl);
      });
  }, [initialStoragePath]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Filen måste vara en bild.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Bilden får vara högst 10 MB.");
      return;
    }

    setError(null);
    setIsUploading(true);

    const supabase = createClient();
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${projectId}/${DIRECTION_STORAGE_SLUG[direction]}.${extension}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setError("Kunde inte ladda upp bilden. Försök igen.");
        return;
      }

      const { error: dbError } = await supabase
        .from("project_images")
        .upsert(
          { project_id: projectId, direction, storage_path: path },
          { onConflict: "project_id,direction" },
        );
      if (dbError) {
        setError("Bilden laddades upp men kunde inte sparas. Försök igen.");
        return;
      }

      const { data: signedUrlData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      if (signedUrlData?.signedUrl) setPreviewUrl(signedUrlData.signedUrl);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border p-3 text-sm hover:border-accent">
      <span className="font-medium">{DIRECTION_LABEL[direction]}</span>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Fasad mot ${DIRECTION_LABEL[direction].toLowerCase()}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-foreground/50">
            {isUploading ? "Laddar upp…" : "Ladda upp foto"}
          </span>
        )}
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
    </label>
  );
}
