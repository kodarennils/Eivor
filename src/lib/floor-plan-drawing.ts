// Generates a schematic interior floor plan (planritning). The exterior
// envelope comes from the same width/depth as every other drawing.
// Room subdivision, window counts and entrance side all come from new
// form fields (rooms[], windowsPerDirection, mainEntranceDirection) - if
// none are filled in, the interior is left empty rather than guessed.
//
// Room layout is a simple recursive rectangle split (a basic treemap),
// not a real architectural design - each room's share of the floor area
// matches its stated percentage, but wall positions are illustrative.

import type { Direction } from "@/lib/project-fields";
import {
  PX_PER_METER,
  escapeXml,
  dimensionLine,
  extensionLine,
  scaleBar,
  northArrow,
  titleBlock,
} from "@/lib/drawing-primitives";

export type RoomInput = { type: string; fraction: number };

export type FloorPlanInput = {
  widthMeters: number;
  depthMeters: number;
  rooms: RoomInput[];
  windowsPerDirection: Partial<Record<Direction, number>>;
  mainEntranceDirection?: Direction;
  propertyDesignation?: string;
};

const MARGIN = 90;
const DIM_OFFSET = 32;
const EXT_OVERHANG = 6;
const WINDOW_WIDTH_M = 1.1;
const DOOR_WIDTH_M = 0.9;

type RoomRect = RoomInput & { x: number; y: number; width: number; height: number };

// Recursively splits the footprint in two (along whichever axis is
// longer) at the point closest to an even split of the remaining rooms'
// combined fraction, then recurses into each half.
function layoutRooms(rooms: RoomInput[], x: number, y: number, w: number, h: number): RoomRect[] {
  if (rooms.length === 0) return [];
  if (rooms.length === 1) return [{ ...rooms[0], x, y, width: w, height: h }];

  const total = rooms.reduce((sum, r) => sum + r.fraction, 0) || 1;
  let cumulative = 0;
  let splitIndex = 1;
  for (let i = 0; i < rooms.length; i++) {
    cumulative += rooms[i].fraction;
    if (cumulative >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.max(1, Math.min(rooms.length - 1, splitIndex));

  const groupA = rooms.slice(0, splitIndex);
  const groupB = rooms.slice(splitIndex);
  const fractionA = groupA.reduce((sum, r) => sum + r.fraction, 0) / total;

  if (w >= h) {
    const widthA = w * fractionA;
    return [
      ...layoutRooms(groupA, x, y, widthA, h),
      ...layoutRooms(groupB, x + widthA, y, w - widthA, h),
    ];
  }
  const heightA = h * fractionA;
  return [
    ...layoutRooms(groupA, x, y, w, heightA),
    ...layoutRooms(groupB, x, y + heightA, w, h - heightA),
  ];
}

function windowMarks(
  count: number,
  wallX: number,
  wallY: number,
  wallLength: number,
  orientation: "horizontal" | "vertical",
): string {
  if (!count) return "";
  const spacing = wallLength / (count + 1);
  const half = (WINDOW_WIDTH_M * PX_PER_METER) / 2;
  const marks: string[] = [];
  for (let i = 1; i <= count; i++) {
    const pos = spacing * i;
    if (orientation === "horizontal") {
      marks.push(
        `<line x1="${wallX + pos - half}" y1="${wallY}" x2="${wallX + pos + half}" y2="${wallY}" stroke="#5b8dc9" stroke-width="5"/>`,
      );
    } else {
      marks.push(
        `<line x1="${wallX}" y1="${wallY + pos - half}" x2="${wallX}" y2="${wallY + pos + half}" stroke="#5b8dc9" stroke-width="5"/>`,
      );
    }
  }
  return marks.join("\n");
}

function entranceMark(
  wallX: number,
  wallY: number,
  wallLength: number,
  orientation: "horizontal" | "vertical",
): string {
  const doorPx = DOOR_WIDTH_M * PX_PER_METER;
  const center = wallLength / 2;
  if (orientation === "horizontal") {
    const x0 = wallX + center - doorPx / 2;
    return `
      <line x1="${x0}" y1="${wallY}" x2="${x0 + doorPx}" y2="${wallY}" stroke="white" stroke-width="5"/>
      <text x="${x0 + doorPx / 2}" y="${wallY - 8}" font-size="9" text-anchor="middle" fill="#333">Entré</text>
    `;
  }
  const y0 = wallY + center - doorPx / 2;
  return `
    <line x1="${wallX}" y1="${y0}" x2="${wallX}" y2="${y0 + doorPx}" stroke="white" stroke-width="5"/>
    <text x="${wallX + 10}" y="${y0 + doorPx / 2 + 3}" font-size="9" text-anchor="start" fill="#333">Entré</text>
  `;
}

export function generateFloorPlanInteriorSVG(input: FloorPlanInput): string {
  const width = input.widthMeters * PX_PER_METER;
  const depth = input.depthMeters * PX_PER_METER;

  const originX = MARGIN;
  const originY = MARGIN;
  const buildingRight = originX + width;
  const buildingBottom = originY + depth;

  const svgWidth = width + MARGIN * 2 + 40;
  const svgHeight = depth + MARGIN * 2 + 130;

  const totalFraction = input.rooms.reduce((sum, r) => sum + r.fraction, 0);
  const normalizedRooms =
    totalFraction > 0
      ? input.rooms.map((r) => ({ ...r, fraction: r.fraction / totalFraction }))
      : [];
  const roomRects = layoutRooms(normalizedRooms, originX, originY, width, depth);

  const rooms = roomRects
    .map((room) => {
      const areaSqm = (room.width * room.height) / (PX_PER_METER * PX_PER_METER);
      return `
      <rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"
        fill="none" stroke="black" stroke-width="1.25"/>
      <text x="${room.x + room.width / 2}" y="${room.y + room.height / 2 - 6}"
        font-size="11" text-anchor="middle" fill="#222">${escapeXml(room.type)}</text>
      <text x="${room.x + room.width / 2}" y="${room.y + room.height / 2 + 10}"
        font-size="9" text-anchor="middle" fill="#666">${areaSqm.toFixed(1)} m²</text>
    `;
    })
    .join("\n");

  const windows = [
    windowMarks(input.windowsPerDirection.norr ?? 0, originX, originY, width, "horizontal"),
    windowMarks(input.windowsPerDirection.söder ?? 0, originX, buildingBottom, width, "horizontal"),
    windowMarks(input.windowsPerDirection.väster ?? 0, originX, originY, depth, "vertical"),
    windowMarks(input.windowsPerDirection.öster ?? 0, buildingRight, originY, depth, "vertical"),
  ].join("\n");

  const entrance = (() => {
    switch (input.mainEntranceDirection) {
      case "norr":
        return entranceMark(originX, originY, width, "horizontal");
      case "söder":
        return entranceMark(originX, buildingBottom, width, "horizontal");
      case "väster":
        return entranceMark(originX, originY, depth, "vertical");
      case "öster":
        return entranceMark(buildingRight, originY, depth, "vertical");
      default:
        return "";
    }
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>

    <text x="${MARGIN}" y="30" font-size="16" font-weight="600">Planritning (schematisk)</text>
    <text x="${MARGIN}" y="48" font-size="10" fill="#666">Rumsindelning proportionerlig mot angivna andelar - inte en arkitektonisk design</text>

    <!-- Exterior envelope: from bredd/djup in formuläret, same as övriga ritningar -->
    <rect x="${originX}" y="${originY}" width="${width}" height="${depth}" fill="none" stroke="black" stroke-width="2.5"/>

    <!-- Interior room subdivision: from rums-andelarna i formuläret -->
    ${rooms || `<text x="${originX + width / 2}" y="${originY + depth / 2}" font-size="11" text-anchor="middle" fill="#999">Inga rum angivna ännu</text>`}

    <!-- Window marks: from fönsterantal per vägg -->
    ${windows}

    <!-- Main entrance -->
    ${entrance}

    <!-- Width dimension (top) -->
    ${extensionLine(originX, originY, originX, originY - DIM_OFFSET - EXT_OVERHANG)}
    ${extensionLine(buildingRight, originY, buildingRight, originY - DIM_OFFSET - EXT_OVERHANG)}
    ${dimensionLine(originX, originY - DIM_OFFSET, buildingRight, originY - DIM_OFFSET, `${input.widthMeters.toFixed(1)} m`, "horizontal")}

    <!-- Depth dimension (left) -->
    ${extensionLine(originX, originY, originX - DIM_OFFSET - EXT_OVERHANG, originY)}
    ${extensionLine(originX, buildingBottom, originX - DIM_OFFSET - EXT_OVERHANG, buildingBottom)}
    ${dimensionLine(originX - DIM_OFFSET, originY, originX - DIM_OFFSET, buildingBottom, `${input.depthMeters.toFixed(1)} m`, "vertical")}

    ${northArrow(svgWidth - 50, 40)}

    ${scaleBar(MARGIN, buildingBottom + 30)}

    ${titleBlock({
      svgWidth,
      svgHeight,
      margin: MARGIN,
      heading: "Skala 1:100 · Planritning",
      note: "Genererad av Eivor. Ytterväggarnas mått kommer direkt från formuläret. Rumsindelning, fönsterplacering och entré är schematiska - baserade på angivna andelar/antal, inte en verklig planlösning eller dörrarnas öppningsriktning.",
      propertyDesignation: input.propertyDesignation,
    })}
  </svg>`;
}
