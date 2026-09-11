// Generates a vertical cross-section (sektionsritning). Uses the same
// measurements as the facade elevations (depthMeters, heightMeters) - no
// new data collection needed for this basic version. Consistent with
// facade-drawing.ts's roof assumption (ridge running east-west): a
// north-south cut through the depth shows the same triangular gable
// profile as the öster/väster elevations.

import {
  PX_PER_METER,
  dimensionLine,
  extensionLine,
  groundLine,
  scaleBar,
  titleBlock,
} from "@/lib/drawing-primitives";

export type SectionDrawingInput = {
  depthMeters: number;
  heightMeters: number; // nockhöjd
  propertyDesignation?: string;
};

const MARGIN = 90;
const DIM_OFFSET = 32;
const EXT_OVERHANG = 6;

// Same eave-height estimate as facade-drawing.ts, kept in sync manually
// since both derive it from nockhöjd alone.
function estimateEaveHeight(nockhojd: number): number {
  return Math.max(2.2, Math.min(nockhojd - 0.8, nockhojd * 0.75));
}

// A single schematic floor division line, only shown when there's
// plausibly room for one - the form doesn't collect number of storeys.
const STOREY_HEIGHT_M = 2.4;

export function generateSectionSVG(input: SectionDrawingInput): string {
  const eaveHeightM = estimateEaveHeight(input.heightMeters);
  const spanPx = input.depthMeters * PX_PER_METER;
  const eaveHeightPx = eaveHeightM * PX_PER_METER;
  const ridgeHeightPx = input.heightMeters * PX_PER_METER;

  const groundY = eaveHeightPx + 130;
  const wallTopY = groundY - eaveHeightPx;
  const ridgeY = groundY - ridgeHeightPx;

  const wallLeft = MARGIN;
  const wallRight = MARGIN + spanPx;
  const midX = (wallLeft + wallRight) / 2;

  const svgWidth = spanPx + MARGIN * 2 + 160;
  // Same band layout as facade-drawing.ts: scale bar clear of the ground
  // hatch, title block clear of the scale bar.
  const svgHeight = groundY + 150;
  const scaleBarY = groundY + 30;

  const showStorey = eaveHeightM > STOREY_HEIGHT_M + 0.8;
  const storeyY = groundY - STOREY_HEIGHT_M * PX_PER_METER;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>

    <text x="${MARGIN}" y="30" font-size="16" font-weight="600">Sektion A-A</text>
    <text x="${MARGIN}" y="48" font-size="10" fill="#666">Snitt genom djupled (norr-söder), takfallets profil syns i genomskärning</text>

    <!-- Building envelope in section: the only geometry, from djup/nockhöjd i formuläret -->
    <rect x="${wallLeft}" y="${wallTopY}" width="${spanPx}" height="${eaveHeightPx}" fill="none" stroke="black" stroke-width="2"/>
    <polygon points="${wallLeft},${wallTopY} ${midX},${ridgeY} ${wallRight},${wallTopY}" fill="none" stroke="black" stroke-width="2"/>
    <line x1="${wallLeft}" y1="${wallTopY}" x2="${midX}" y2="${ridgeY}" stroke="black" stroke-width="0.75" stroke-dasharray="3,2"/>
    <line x1="${wallRight}" y1="${wallTopY}" x2="${midX}" y2="${ridgeY}" stroke="black" stroke-width="0.75" stroke-dasharray="3,2"/>

    ${
      showStorey
        ? `<line x1="${wallLeft}" y1="${storeyY}" x2="${wallRight}" y2="${storeyY}" stroke="black" stroke-width="0.75" stroke-dasharray="5,3"/>
           <text x="${wallLeft + 6}" y="${storeyY - 4}" font-size="8" fill="#666">Våningshöjd (schematisk, ${STOREY_HEIGHT_M.toFixed(1)} m antagen)</text>`
        : ""
    }

    ${groundLine(wallLeft - 30, wallRight + 30, groundY)}

    <!-- Nockhöjd dimension -->
    ${extensionLine(wallRight, ridgeY, wallRight + DIM_OFFSET + EXT_OVERHANG, ridgeY)}
    ${extensionLine(wallRight, groundY, wallRight + DIM_OFFSET + EXT_OVERHANG, groundY)}
    ${dimensionLine(
      wallRight + DIM_OFFSET,
      ridgeY,
      wallRight + DIM_OFFSET,
      groundY,
      `${input.heightMeters.toFixed(1)} m (nock)`,
      "vertical",
    )}

    <!-- Depth dimension -->
    ${extensionLine(wallLeft, wallTopY, wallLeft, wallTopY - DIM_OFFSET - EXT_OVERHANG)}
    ${extensionLine(wallRight, wallTopY, wallRight, wallTopY - DIM_OFFSET - EXT_OVERHANG)}
    ${dimensionLine(
      wallLeft,
      wallTopY - DIM_OFFSET,
      wallRight,
      wallTopY - DIM_OFFSET,
      `${input.depthMeters.toFixed(1)} m`,
      "horizontal",
    )}

    ${scaleBar(MARGIN, scaleBarY)}

    ${titleBlock({
      svgWidth,
      svgHeight,
      margin: MARGIN,
      heading: "Skala 1:100 · Sektion A-A",
      note: "Genererad av Eivor. Nockhöjd och djup kommer direkt från formuläret. Takfotshöjd, våningshöjd och nockens exakta läge är schematiska uppskattningar - inga sådana mått samlas in ännu.",
      propertyDesignation: input.propertyDesignation,
    })}
  </svg>`;
}
