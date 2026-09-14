"use client";

import { Stage, Layer, Line, Rect, Group } from "react-konva";
import type Konva from "konva";
import {
  type DrawingModel,
  type Wall,
  wallLengthMm,
  pointAlongWall,
  findWall,
  projectPointToWallOffsetMm,
  clampOffsetToWall,
} from "@/lib/drawing-schema";
import { DIRECTION_LABEL, type Direction } from "@/lib/project-fields";

// Phase D: constrained dragging for windows/doors, plus a side-panel
// form showing the same offset/width/height values - both write paths
// go through the SAME updateOpening() function below, so "drag it" and
// "type a number" can never disagree about what the current state is.
//
// Not wired to persistence (no API call, no DB write) - this manages
// its own local model state via onModelChange, same scope as Phase D
// was defined: the interactive editing UI, not the storage layer for it.

const PX_PER_MM = 60 / 1000;
const MARGIN_PX = 40;
const WALL_STROKE = "black";
const WALL_STROKE_WIDTH = 2;
const HANDLE_SIZE = 10;

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}
function pxToMm(px: number): number {
  return px / PX_PER_MM;
}

type OpeningKind = "window" | "door";

function wallLabel(wallId: string): string {
  const direction = wallId.replace(/^wall-/, "") as Direction;
  return DIRECTION_LABEL[direction] ?? wallId;
}

export function DrawingModelEditor({
  model,
  onModelChange,
}: {
  model: DrawingModel;
  onModelChange: (model: DrawingModel) => void;
}) {
  function updateOpening(kind: OpeningKind, id: string, offsetMm: number) {
    if (kind === "window") {
      onModelChange({
        ...model,
        windows: model.windows.map((w) => (w.id === id ? { ...w, offsetMm } : w)),
      });
    } else {
      onModelChange({
        ...model,
        doors: model.doors.map((d) => (d.id === id ? { ...d, offsetMm } : d)),
      });
    }
  }

  return (
    <div className="flex flex-wrap gap-6">
      <EditableFloorPlanCanvas model={model} onOpeningOffsetChange={updateOpening} />
      <OpeningsForm model={model} onOpeningOffsetChange={updateOpening} />
    </div>
  );
}

function EditableFloorPlanCanvas({
  model,
  onOpeningOffsetChange,
}: {
  model: DrawingModel;
  onOpeningOffsetChange: (kind: OpeningKind, id: string, offsetMm: number) => void;
}) {
  if (model.walls.length === 0) {
    return <p className="text-sm text-foreground/50">Ingen planritning att visa.</p>;
  }

  const allPoints = model.walls.flatMap((w) => [w.start, w.end]);
  const minX = Math.min(...allPoints.map((p) => p.xMm));
  const minY = Math.min(...allPoints.map((p) => p.yMm));
  const maxX = Math.max(...allPoints.map((p) => p.xMm));
  const maxY = Math.max(...allPoints.map((p) => p.yMm));
  const width = mmToPx(maxX - minX) + MARGIN_PX * 2;
  const height = mmToPx(maxY - minY) + MARGIN_PX * 2;

  function toStage(p: { xMm: number; yMm: number }) {
    return { x: mmToPx(p.xMm - minX) + MARGIN_PX, y: mmToPx(p.yMm - minY) + MARGIN_PX };
  }
  function toModelPoint(stagePoint: { x: number; y: number }) {
    return { xMm: pxToMm(stagePoint.x - MARGIN_PX) + minX, yMm: pxToMm(stagePoint.y - MARGIN_PX) + minY };
  }

  // Same clamped value is used both to constrain the handle's LIVE
  // position during the gesture (dragBoundFunc, called by Konva on every
  // move) and to commit the new offset to React state (onDragMove) - if
  // these ever disagreed (e.g. different rounding), the handle could
  // visually fight the state-driven re-render mid-drag. Rounding happens
  // in exactly one place (here) and both usages call through it.
  function resolveClampedOffsetMm(wall: Wall, widthMm: number, stagePos: { x: number; y: number }): number {
    const modelPoint = toModelPoint(stagePos);
    const rawOffsetMm = projectPointToWallOffsetMm(wall, modelPoint);
    return Math.round(clampOffsetToWall(rawOffsetMm, widthMm, wall));
  }

  function dragHandleProps(kind: OpeningKind, id: string, wall: Wall, widthMm: number) {
    return {
      draggable: true,
      dragBoundFunc(this: Konva.Node, pos: { x: number; y: number }) {
        const clamped = resolveClampedOffsetMm(wall, widthMm, pos);
        return toStage(pointAlongWall(wall, clamped));
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        const clamped = resolveClampedOffsetMm(wall, widthMm, { x: e.target.x(), y: e.target.y() });
        onOpeningOffsetChange(kind, id, clamped);
      },
    };
  }

  return (
    <Stage width={width} height={height}>
      <Layer>
        {model.walls.map((wall) => {
          const start = toStage(wall.start);
          const end = toStage(wall.end);
          return (
            <Line
              key={wall.id}
              points={[start.x, start.y, end.x, end.y]}
              stroke={WALL_STROKE}
              strokeWidth={WALL_STROKE_WIDTH}
              lineCap="square"
            />
          );
        })}

        {model.windows.map((win) => {
          const wall = findWall(model, win.wallId);
          if (!wall) return null;
          const p1 = toStage(pointAlongWall(wall, win.offsetMm));
          const p2 = toStage(pointAlongWall(wall, win.offsetMm + win.widthMm));
          return (
            <Group key={win.id}>
              <Line points={[p1.x, p1.y, p2.x, p2.y]} stroke={WALL_STROKE} strokeWidth={WALL_STROKE_WIDTH * 2.5} />
              <Rect
                x={p1.x - HANDLE_SIZE / 2}
                y={p1.y - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                fill="#2c5f8a"
                stroke="white"
                strokeWidth={1}
                cornerRadius={2}
                {...dragHandleProps("window", win.id, wall, win.widthMm)}
              />
            </Group>
          );
        })}

        {model.doors.map((door) => {
          const wall = findWall(model, door.wallId);
          if (!wall) return null;
          const p1 = toStage(pointAlongWall(wall, door.offsetMm));
          const p2 = toStage(pointAlongWall(wall, door.offsetMm + door.widthMm));
          return (
            <Group key={door.id}>
              <Line points={[p1.x, p1.y, p2.x, p2.y]} stroke="white" strokeWidth={WALL_STROKE_WIDTH + 1} />
              <Rect
                x={p1.x - HANDLE_SIZE / 2}
                y={p1.y - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                fill="#8a4a2c"
                stroke="white"
                strokeWidth={1}
                cornerRadius={2}
                {...dragHandleProps("door", door.id, wall, door.widthMm)}
              />
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}

// Same values, same write path (onOpeningOffsetChange -> the parent's
// updateOpening -> onModelChange) as the drag handles above - typing a
// number here and dragging the handle in the canvas both end up calling
// the identical function with an already-clamped-by-construction value
// where possible (offset here is clamped on blur, same clampOffsetToWall
// rule the drag uses).
function OpeningsForm({
  model,
  onOpeningOffsetChange,
}: {
  model: DrawingModel;
  onOpeningOffsetChange: (kind: OpeningKind, id: string, offsetMm: number) => void;
}) {
  const rows: { kind: OpeningKind; id: string; wallId: string; offsetMm: number; widthMm: number; heightMm: number }[] =
    [
      ...model.windows.map((w) => ({ kind: "window" as const, ...w })),
      ...model.doors.map((d) => ({ kind: "door" as const, ...d })),
    ];

  return (
    <div className="min-w-[220px] flex-1 rounded-lg border border-border bg-white p-3">
      <p className="mb-2 text-xs font-medium tracking-wide text-foreground/50 uppercase">
        Fönster &amp; dörrar
      </p>
      <div className="space-y-3">
        {rows.map((row) => {
          const wall = findWall(model, row.wallId);
          const maxOffsetMm = wall ? Math.max(0, wallLengthMm(wall) - row.widthMm) : row.offsetMm;
          return (
            <div key={row.id} className="rounded-md border border-border p-2 text-xs">
              <p className="mb-1 font-medium">
                {row.kind === "window" ? "Fönster" : "Dörr"} · {wallLabel(row.wallId)}
              </p>
              <label className="flex items-center justify-between gap-2">
                <span className="text-foreground/50">Avstånd från väggens start</span>
                <input
                  type="number"
                  value={row.offsetMm}
                  min={0}
                  max={maxOffsetMm}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw) || !wall) return;
                    onOpeningOffsetChange(row.kind, row.id, Math.round(clampOffsetToWall(raw, row.widthMm, wall)));
                  }}
                  className="w-20 rounded border border-border px-1.5 py-1 text-right outline-none focus:border-accent"
                />
              </label>
              <div className="mt-1 flex justify-between text-foreground/40">
                <span>Bredd: {row.widthMm} mm</span>
                <span>Höjd: {row.heightMm} mm</span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-foreground/40">Inga fönster eller dörrar i den här modellen.</p>}
      </div>
    </div>
  );
}
