// Generates a scale-accurate technical floor-plan (volume) drawing (SVG)
// from the user-entered measurements only. Facade material/colour -
// derived from photo analysis (see facade-analysis.ts) - is added purely
// as text annotation on the drawing and never affects the geometry below.

import type { Direction } from "@/lib/project-fields";
import {
  PX_PER_METER,
  escapeXml,
  dimensionLine,
  extensionLine,
  northArrow,
  titleBlock,
} from "@/lib/drawing-primitives";

export type FacadeAttributes = {
  material: string;
  color: string;
};

export type DrawingInput = {
  widthMeters: number;
  depthMeters: number;
  heightMeters?: number;
  propertyDesignation?: string;
  facadeAttributes?: Partial<Record<Direction, FacadeAttributes>>;
};

const MARGIN = 90; // room for dimension lines + facade labels
const DIM_OFFSET = 32; // distance of dimension line from the building outline
const EXT_OVERHANG = 6; // extension line overshoot past the dimension line

const DIRECTION_SIDE_LABEL: Record<Direction, string> = {
  norr: "Norr",
  öster: "Öster",
  söder: "Söder",
  väster: "Väster",
};

function facadeLabel(direction: Direction, attrs: FacadeAttributes | undefined): string {
  if (!attrs) return "";
  return `${DIRECTION_SIDE_LABEL[direction]}: ${escapeXml(attrs.material)}, ${escapeXml(attrs.color)}`;
}

export function generateFloorPlanSVG(input: DrawingInput): string {
  const width = input.widthMeters * PX_PER_METER;
  const depth = input.depthMeters * PX_PER_METER;

  const originX = MARGIN;
  const originY = MARGIN;
  const buildingRight = originX + width;
  const buildingBottom = originY + depth;

  const svgWidth = width + MARGIN * 2 + 140; // extra room for facade label column
  const svgHeight = depth + MARGIN * 2 + 70; // extra room for title block

  const facadeLines = [
    facadeLabel("norr", input.facadeAttributes?.norr),
    facadeLabel("öster", input.facadeAttributes?.öster),
    facadeLabel("söder", input.facadeAttributes?.söder),
    facadeLabel("väster", input.facadeAttributes?.väster),
  ].filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>

    <!-- Building outline: the only element derived from user-entered measurements -->
    <rect x="${originX}" y="${originY}" width="${width}" height="${depth}"
      fill="none" stroke="black" stroke-width="2"/>

    <!-- Width dimension (top) -->
    ${extensionLine(originX, originY, originX, originY - DIM_OFFSET - EXT_OVERHANG)}
    ${extensionLine(buildingRight, originY, buildingRight, originY - DIM_OFFSET - EXT_OVERHANG)}
    ${dimensionLine(
      originX,
      originY - DIM_OFFSET,
      buildingRight,
      originY - DIM_OFFSET,
      `${input.widthMeters.toFixed(1)} m`,
      "horizontal",
    )}

    <!-- Depth dimension (left) -->
    ${extensionLine(originX, originY, originX - DIM_OFFSET - EXT_OVERHANG, originY)}
    ${extensionLine(originX, buildingBottom, originX - DIM_OFFSET - EXT_OVERHANG, buildingBottom)}
    ${dimensionLine(
      originX - DIM_OFFSET,
      originY,
      originX - DIM_OFFSET,
      buildingBottom,
      `${input.depthMeters.toFixed(1)} m`,
      "vertical",
    )}

    <!-- Compass direction labels on the outline itself (drawing orientation: norr = upp) -->
    <text x="${originX + width / 2}" y="${originY - DIM_OFFSET - EXT_OVERHANG - 8}" font-size="10" text-anchor="middle" fill="#666">NORR</text>
    <text x="${originX + width / 2}" y="${buildingBottom + 16}" font-size="10" text-anchor="middle" fill="#666">SÖDER</text>
    <text x="${originX - DIM_OFFSET - EXT_OVERHANG - 8}" y="${originY + depth / 2}" font-size="10" text-anchor="middle" fill="#666" transform="rotate(-90 ${originX - DIM_OFFSET - EXT_OVERHANG - 8} ${originY + depth / 2})">VÄSTER</text>
    <text x="${buildingRight + 12}" y="${originY + depth / 2}" font-size="10" text-anchor="start" fill="#666">ÖSTER</text>

    ${northArrow(svgWidth - 50, 40)}

    <!-- Facade material/colour annotations - from photo analysis, NOT geometry -->
    <g font-size="11" fill="#555">
      <text x="${buildingRight + 12}" y="${originY + depth / 2 + 30}" font-style="italic" font-size="9">Fasadattribut (från fotoanalys):</text>
      ${facadeLines
        .map(
          (line, i) =>
            `<text x="${buildingRight + 12}" y="${originY + depth / 2 + 46 + i * 14}">${line}</text>`,
        )
        .join("\n")}
    </g>

    ${titleBlock({
      svgWidth,
      svgHeight,
      margin: MARGIN,
      heading: "Skala 1:100 (schematisk, ej i verklig storlek på skärm)" + (input.heightMeters ? ` · Nockhöjd ${input.heightMeters.toFixed(1)} m` : ""),
      note: "Genererad av Eivor. Geometrin bygger uteslutande på angivna mått i formuläret. Fasadmaterial/kulör är AI-tolkade etiketter från bifogade foton, inte mätdata.",
      propertyDesignation: input.propertyDesignation,
    })}
  </svg>`;
}
