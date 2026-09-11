// Composites a user-uploaded nybyggnadskarta with our building footprint
// drawn to scale on top, using a manual pixels-per-meter calibration (see
// the migration note on why a print scale ratio can't be used here).
//
// Honesty matters more than polish here: the placement is the user's own
// click, not a survey, so this always carries a preliminary/manual-siting
// disclaimer regardless of how it's built.

import { escapeXml } from "@/lib/drawing-primitives";

export type SituationsplanInput = {
  mapImageDataUri: string;
  imageWidth: number;
  imageHeight: number;
  pixelsPerMeter: number;
  buildingX: number;
  buildingY: number;
  widthMeters: number;
  depthMeters: number;
  distanceToBoundaryMeters?: number;
  propertyDesignation?: string;
};

export function generateSituationsplanSVG(input: SituationsplanInput): string {
  const {
    mapImageDataUri,
    imageWidth,
    imageHeight,
    pixelsPerMeter,
    buildingX,
    buildingY,
    widthMeters,
    depthMeters,
    distanceToBoundaryMeters,
    propertyDesignation,
  } = input;

  const buildingWidthPx = widthMeters * pixelsPerMeter;
  const buildingHeightPx = depthMeters * pixelsPerMeter;
  const bannerHeight = 34;
  const captionHeight = 64;
  const svgHeight = imageHeight + bannerHeight + captionHeight;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${imageWidth} ${svgHeight}" font-family="system-ui, sans-serif">
    <rect x="0" y="0" width="${imageWidth}" height="${svgHeight}" fill="white"/>

    <!-- Prominent disclaimer: this is a manually-sited overlay, not a survey -->
    <rect x="0" y="0" width="${imageWidth}" height="${bannerHeight}" fill="#fef3c7"/>
    <text x="${imageWidth / 2}" y="${bannerHeight / 2 + 5}" font-size="13" font-weight="700" text-anchor="middle" fill="#92400e">PRELIMINÄR PLACERING — manuellt positionerad av användaren, inte georefererad eller uppmätt</text>

    <!-- The uploaded nybyggnadskarta, unmodified -->
    <image href="${mapImageDataUri}" x="0" y="${bannerHeight}" width="${imageWidth}" height="${imageHeight}"/>

    <!-- Building footprint overlay: sized from width/depth via the manual
         pixels-per-meter calibration, positioned at the user's click. -->
    <rect x="${buildingX}" y="${buildingY + bannerHeight}" width="${buildingWidthPx}" height="${buildingHeightPx}"
      fill="rgba(44,95,138,0.25)" stroke="#2c5f8a" stroke-width="2.5"/>
    <text x="${buildingX + buildingWidthPx / 2}" y="${buildingY + bannerHeight + buildingHeightPx / 2}"
      font-size="12" font-weight="600" fill="#1d4270" text-anchor="middle" dominant-baseline="middle">
      ${widthMeters.toFixed(1)} × ${depthMeters.toFixed(1)} m
    </text>

    <!-- Caption -->
    <g font-size="10" fill="#333">
      <line x1="0" y1="${imageHeight + bannerHeight}" x2="${imageWidth}" y2="${imageHeight + bannerHeight}" stroke="black" stroke-width="0.5"/>
      <text x="16" y="${imageHeight + bannerHeight + 18}" font-weight="600">Situationsplan (overlay på uppladdad nybyggnadskarta)</text>
      ${
        propertyDesignation
          ? `<text x="16" y="${imageHeight + bannerHeight + 32}">Fastighet: ${escapeXml(propertyDesignation)}</text>`
          : ""
      }
      ${
        distanceToBoundaryMeters
          ? `<text x="16" y="${imageHeight + bannerHeight + 46}">Avstånd till tomtgräns enligt formulär: ${distanceToBoundaryMeters.toFixed(1)} m (ej verifierat mot kartans egna gränslinjer)</text>`
          : ""
      }
      <text x="16" y="${imageHeight + bannerHeight + 60}" font-size="8" fill="#888">Byggnadens storlek är skalenlig utifrån bredd/djup i formuläret och en manuell kalibrering (klick mot ett känt avstånd på kartan). Läget är satt av användaren för hand och ersätter inte en beställd, georefererad nybyggnadskarta.</text>
    </g>
  </svg>`;
}
