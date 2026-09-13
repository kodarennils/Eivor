"use client";

import { useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function DetaljplanUpload({
  projectId,
  hasExistingUpload,
  onUploaded,
}: {
  projectId: string;
  hasExistingUpload: boolean;
  onUploaded?: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(hasExistingUpload);
  const [characters, setCharacters] = useState<number | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Filen måste vara en PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Filen får vara högst 20 MB.");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);

      const res = await fetch("/api/projekt/detaljplan", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Kunde inte ladda upp filen.");
        return;
      }

      setUploaded(true);
      setCharacters(data.characters ?? null);
      onUploaded?.();
    } catch {
      setError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm hover:border-accent">
        {isUploading ? "Läser PDF…" : uploaded ? "Byt detaljplan" : "Ladda upp detaljplan (PDF)"}
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </label>
      {uploaded && !error && (
        <p className="text-xs text-foreground/50">
          Detaljplan uppladdad{characters ? ` (${characters.toLocaleString("sv-SE")} tecken text hittades)` : ""}.
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
