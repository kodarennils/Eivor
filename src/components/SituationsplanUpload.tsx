"use client";

import { useRef, useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

type Point = { x: number; y: number };
type Step = "select" | "calibrate1" | "calibrate2" | "distance" | "place" | "ready";

const STEP_INSTRUCTION: Record<Step, string> = {
  select: "Ladda upp en bild av din nybyggnadskarta.",
  calibrate1:
    "Klicka på en punkt på kartan där du vet det verkliga avståndet till en annan punkt (t.ex. ena änden av kartans skalstock, eller ett tomthörn med angivet mått).",
  calibrate2: "Klicka på den andra punkten för samma kända avstånd.",
  distance: "Ange det verkliga avståndet mellan de två punkterna, i meter.",
  place: "Klicka där byggnadens nordvästra hörn ska placeras.",
  ready: "Klart att spara.",
};

export function SituationsplanUpload({
  projectId,
  hasExisting,
  onSaved,
}: {
  projectId: string;
  hasExisting: boolean;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState<Step>(hasExisting ? "ready" : "select");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [calibPoint1, setCalibPoint1] = useState<Point | null>(null);
  const [calibPoint2, setCalibPoint2] = useState<Point | null>(null);
  const [knownDistance, setKnownDistance] = useState("");
  const [pixelsPerMeter, setPixelsPerMeter] = useState<number | null>(null);
  const [buildingPoint, setBuildingPoint] = useState<Point | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(hasExisting);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function reset() {
    setStep("select");
    setFile(null);
    setPreviewUrl(null);
    setNaturalSize(null);
    setCalibPoint1(null);
    setCalibPoint2(null);
    setKnownDistance("");
    setPixelsPerMeter(null);
    setBuildingPoint(null);
    setError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      setError("Filen måste vara en bild (JPG/PNG).");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("Filen får vara högst 20 MB.");
      return;
    }

    setError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setStep("calibrate1");
  }

  function pointFromClick(e: React.MouseEvent<HTMLDivElement>): Point | null {
    const wrapper = wrapperRef.current;
    if (!wrapper || !naturalSize) return null;
    const rect = wrapper.getBoundingClientRect();
    const scaleX = naturalSize.width / rect.width;
    const scaleY = naturalSize.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleWrapperClick(e: React.MouseEvent<HTMLDivElement>) {
    const point = pointFromClick(e);
    if (!point) return;

    if (step === "calibrate1") {
      setCalibPoint1(point);
      setStep("calibrate2");
    } else if (step === "calibrate2") {
      setCalibPoint2(point);
      setStep("distance");
    } else if (step === "place") {
      setBuildingPoint(point);
      setStep("ready");
    }
  }

  function confirmDistance() {
    const meters = Number(knownDistance);
    if (!calibPoint1 || !calibPoint2 || !meters || meters <= 0) {
      setError("Ange ett giltigt avstånd i meter.");
      return;
    }
    const pixelDistance = Math.hypot(calibPoint2.x - calibPoint1.x, calibPoint2.y - calibPoint1.y);
    setPixelsPerMeter(pixelDistance / meters);
    setError(null);
    setStep("place");
  }

  async function handleSave() {
    if (!file || !naturalSize || !pixelsPerMeter || !buildingPoint) return;
    setIsSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);
      formData.append("pixelsPerMeter", String(pixelsPerMeter));
      formData.append("buildingX", String(buildingPoint.x));
      formData.append("buildingY", String(buildingPoint.y));
      formData.append("imageWidth", String(naturalSize.width));
      formData.append("imageHeight", String(naturalSize.height));

      const res = await fetch("/api/projekt/situationsplan", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Kunde inte spara.");
        return;
      }
      setSaved(true);
      onSaved?.();
    } catch {
      setError("Kunde inte nå servern. Försök igen.");
    } finally {
      setIsSaving(false);
    }
  }

  if (step === "select") {
    return (
      <div className="flex flex-col gap-2">
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm hover:border-accent">
          {saved ? "Byt nybyggnadskarta" : "Ladda upp nybyggnadskarta (JPG/PNG)"}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        {saved && (
          <p className="text-xs text-foreground/50">
            En situationsplan är redan sparad. Ladda upp en ny bild för att ersätta den.
          </p>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">{STEP_INSTRUCTION[step]}</p>

      {previewUrl && (
        <div
          ref={wrapperRef}
          onClick={handleWrapperClick}
          className="relative w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Uppladdad nybyggnadskarta"
            className="block w-full"
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            }}
          />
          {naturalSize && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
            >
              {calibPoint1 && calibPoint2 && (
                <line
                  x1={calibPoint1.x}
                  y1={calibPoint1.y}
                  x2={calibPoint2.x}
                  y2={calibPoint2.y}
                  stroke="#e11d48"
                  strokeWidth={Math.max(2, naturalSize.width / 400)}
                />
              )}
              {calibPoint1 && (
                <circle cx={calibPoint1.x} cy={calibPoint1.y} r={naturalSize.width / 150} fill="#e11d48" />
              )}
              {calibPoint2 && (
                <circle cx={calibPoint2.x} cy={calibPoint2.y} r={naturalSize.width / 150} fill="#e11d48" />
              )}
              {buildingPoint && pixelsPerMeter && (
                <rect
                  x={buildingPoint.x}
                  y={buildingPoint.y}
                  width={naturalSize.width / 10}
                  height={naturalSize.width / 12}
                  fill="rgba(44,95,138,0.3)"
                  stroke="#2c5f8a"
                  strokeWidth={Math.max(2, naturalSize.width / 400)}
                />
              )}
            </svg>
          )}
        </div>
      )}

      {step === "distance" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={knownDistance}
            onChange={(e) => setKnownDistance(e.target.value)}
            placeholder="Avstånd i meter"
            className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={confirmDistance}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            Bekräfta
          </button>
        </div>
      )}

      {step === "ready" && !saved && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isSaving ? "Sparar…" : "Spara situationsplan"}
        </button>
      )}

      {saved && step === "ready" && (
        <p className="text-sm text-foreground/70">Situationsplanen är sparad.</p>
      )}

      <button type="button" onClick={reset} className="self-start text-xs text-foreground/50 hover:text-foreground/80">
        Börja om
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
