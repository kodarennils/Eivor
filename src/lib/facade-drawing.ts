// Generates one elevation (fasadritning) per compass direction. Geometry
// (wall span, eave height, ridge height) comes only from the user-entered
// width/depth/height measurements. Window/door placement is not yet
// collected in the form, so it is drawn schematically/proportionally
// rather than from real data - clearly noted on the drawing. Facade
// material/colour from photo analysis is a text label only.
//
// Roof assumption (no roof-design data is collected either): the ridge
// runs east-west, so öster/väster are gable ends (pitch visible as a
// triangle) and norr/söder are eave sides (straight roofline). This is
// stated on every elevation so it reads as a stated assumption, not fact.

import type { Direction } from "@/lib/project-fields";
import {
  PX_PER_METER,
  escapeXml,
  dimensionLine,
  extensionLine,
  groundLine,
  scaleBar,
  titleBlock,
} from "@/lib/drawing-primitives";

export type FacadeAttributes = {
  material: string;
  color: string;
};

export type FacadeDrawingInput = {
  direction: Direction;
  widthMeters: number;
  depthMeters: number;
  heightMeters: number; // nockhöjd
  propertyDesignation?: string;
  facadeAttributes?: FacadeAttributes;
};

const MARGIN = 90;
const DIM_OFFSET = 32;
const EXT_OVERHANG = 6;
const OVERHANG_M = 0.3; // eave overhang, visual only

const DIRECTION_LABEL: Record<Direction, string> = {
  norr: "Norr",
  öster: "Öster",
  söder: "Söder",
  väster: "Väster",
};

const GABLE_DIRECTIONS: Direction[] = ["öster", "väster"];

// Wall height up to the eave, estimated from total ridge height since the
// form doesn't collect it separately. Clamped so the roof always has a
// visible rise.
function estimateEaveHeight(nockhojd: number): number {
  return Math.max(2.2, Math.min(nockhojd - 0.8, nockhojd * 0.75));
}

function windowsAndDoor(spanM: number, wallHeightPx: number, groundY: number): string {
  const doorW = 0.9 * PX_PER_METER;
  const doorH = 2.1 * PX_PER_METER;
  const winW = 1.1 * PX_PER_METER;
  const winH = 1.1 * PX_PER_METER;
  const sill = 0.9 * PX_PER_METER;
  const spanPx = spanM * PX_PER_METER;

  const doorY = groundY - doorH;
  const winY = groundY - sill - winH;

  if (spanPx < doorW + 20) return "";

  const parts: string[] = [];
  const center = spanPx / 2;

  if (spanPx >= doorW + 2 * winW + 60) {
    // Door centered, one window each side
    parts.push(`<rect x="${center - doorW / 2}" y="${doorY}" width="${doorW}" height="${doorH}" fill="white" stroke="black" stroke-width="1"/>`);
    parts.push(`<rect x="${center - doorW / 2 - 30 - winW}" y="${winY}" width="${winW}" height="${winH}" fill="#dce8f0" stroke="black" stroke-width="1"/>`);
    parts.push(`<rect x="${center + doorW / 2 + 30}" y="${winY}" width="${winW}" height="${winH}" fill="#dce8f0" stroke="black" stroke-width="1"/>`);
  } else {
    // Not enough room for windows too - just the door, centered
    parts.push(`<rect x="${center - doorW / 2}" y="${doorY}" width="${doorW}" height="${doorH}" fill="white" stroke="black" stroke-width="1"/>`);
  }

  return parts.join("\n");
}

export function generateFacadeElevationSVG(input: FacadeDrawingInput): string {
  const spanM = input.direction === "norr" || input.direction === "söder"
    ? input.widthMeters
    : input.depthMeters;
  const isGable = GABLE_DIRECTIONS.includes(input.direction);

  const eaveHeightM = estimateEaveHeight(input.heightMeters);
  const spanPx = spanM * PX_PER_METER;
  const eaveHeightPx = eaveHeightM * PX_PER_METER;
  const ridgeHeightPx = input.heightMeters * PX_PER_METER;
  const overhangPx = OVERHANG_M * PX_PER_METER;

  const groundY = eaveHeightPx + 120; // ground line y-coordinate in local drawing space
  const wallTopY = groundY - eaveHeightPx;
  const ridgeY = groundY - ridgeHeightPx;

  const originX = MARGIN + overhangPx;
  const wallLeft = originX;
  const wallRight = originX + spanPx;

  const svgWidth = spanPx + overhangPx * 2 + MARGIN * 2 + 160;
  // Bottom bands below the ground line, each given clear vertical room so
  // the scale bar/captions/title block never overlap the building or
  // each other: ground hatch ends ~ +8, scale bar ~ +22..+46, facade
  // caption ~ +78..+92, title block from ~ +118 down to svgHeight.
  const svgHeight = groundY + 160;
  const scaleBarY = groundY + 30;
  const attrLineY = groundY + 78;
  const noteLineY = groundY + 92;

  const roof = isGable
    ? `<polygon points="${wallLeft},${wallTopY} ${(wallLeft + wallRight) / 2},${ridgeY} ${wallRight},${wallTopY}" fill="none" stroke="black" stroke-width="2"/>`
    : `
      <line x1="${wallLeft - overhangPx}" y1="${wallTopY - 6}" x2="${wallRight + overhangPx}" y2="${wallTopY - 6}" stroke="black" stroke-width="2"/>
      <line x1="${wallLeft - overhangPx}" y1="${wallTopY - 6}" x2="${wallLeft - overhangPx + 10}" y2="${wallTopY + 6}" stroke="black" stroke-width="1.5"/>
      <line x1="${wallRight + overhangPx}" y1="${wallTopY - 6}" x2="${wallRight + overhangPx - 10}" y2="${wallTopY + 6}" stroke="black" stroke-width="1.5"/>
      <line x1="${wallLeft - overhangPx}" y1="${ridgeY}" x2="${wallRight + overhangPx}" y2="${ridgeY}" stroke="black" stroke-width="0.75" stroke-dasharray="4,3"/>
      <text x="${wallRight + overhangPx + 6}" y="${ridgeY + 3}" font-size="8" fill="#666">nock, bakomliggande</text>
    `;

  const attrs = input.facadeAttributes;
  const attrLine = attrs
    ? `Fasad: ${escapeXml(attrs.material)}, ${escapeXml(attrs.color)} (från fotoanalys)`
    : "Fasad: inget foto analyserat ännu";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>

    <text x="${MARGIN}" y="30" font-size="16" font-weight="600">Fasad mot ${DIRECTION_LABEL[input.direction]}</text>
    <text x="${MARGIN}" y="48" font-size="10" fill="#666">${isGable ? "Gavel - takfallet syns i profil" : "Långsida - nock ligger bakom takfoten, visas streckad"}</text>

    <!-- Wall + roof: the only geometry, from width/depth/height in formuläret -->
    <rect x="${wallLeft}" y="${wallTopY}" width="${spanPx}" height="${eaveHeightPx}" fill="none" stroke="black" stroke-width="2"/>
    ${roof}

    <!-- Schematic window/door placeholders - not from real data yet -->
    ${windowsAndDoor(spanM, eaveHeightPx, groundY)}

    ${groundLine(wallLeft - overhangPx - 20, wallRight + overhangPx + 20, groundY)}

    <!-- Height dimension -->
    ${extensionLine(wallRight + overhangPx, ridgeY, wallRight + overhangPx + DIM_OFFSET + EXT_OVERHANG, ridgeY)}
    ${extensionLine(wallRight + overhangPx, groundY, wallRight + overhangPx + DIM_OFFSET + EXT_OVERHANG, groundY)}
    ${dimensionLine(
      wallRight + overhangPx + DIM_OFFSET,
      ridgeY,
      wallRight + overhangPx + DIM_OFFSET,
      groundY,
      `${input.heightMeters.toFixed(1)} m`,
      "vertical",
    )}

    <!-- Span dimension -->
    ${extensionLine(wallLeft, wallTopY, wallLeft, wallTopY - DIM_OFFSET - EXT_OVERHANG)}
    ${extensionLine(wallRight, wallTopY, wallRight, wallTopY - DIM_OFFSET - EXT_OVERHANG)}
    ${dimensionLine(
      wallLeft,
      wallTopY - DIM_OFFSET,
      wallRight,
      wallTopY - DIM_OFFSET,
      `${spanM.toFixed(1)} m`,
      "horizontal",
    )}

    ${scaleBar(MARGIN, scaleBarY)}

    <text x="${MARGIN}" y="${attrLineY}" font-size="10" fill="#333">${attrLine}</text>
    <text x="${MARGIN}" y="${noteLineY}" font-size="8" fill="#888">Fönster/dörr visas schematiskt och proportionerligt - exakt placering samlas inte in i formuläret ännu.</text>

    ${titleBlock({
      svgWidth,
      svgHeight,
      margin: MARGIN,
      heading: `Skala 1:100 · Fasad ${DIRECTION_LABEL[input.direction].toLowerCase()}`,
      note: "Genererad av Eivor. Väggens höjd till takfot är en uppskattning (nockhöjd minus schematiskt takfall), eftersom våningshöjd/takfotshöjd inte samlas in separat. Nockhöjd kommer direkt från formuläret.",
      propertyDesignation: input.propertyDesignation,
    })}
  </svg>`;
}
