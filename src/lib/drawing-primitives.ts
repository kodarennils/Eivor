// Shared low-level SVG building blocks used by every drawing module
// (plan, facade elevations, section). Kept separate from the drawing
// modules themselves so each one stays focused on its own geometry.

export const PX_PER_METER = 60;

// Material/colour come from an LLM's photo analysis and free-typed user
// input like fastighetsbeteckning - neither is trusted enough to
// interpolate raw into SVG markup that later gets rendered via
// dangerouslySetInnerHTML.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function dimensionLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  orientation: "horizontal" | "vertical",
): string {
  const arrow = (x: number, y: number, angle: number) =>
    `<path d="M ${x} ${y} l ${6 * Math.cos(angle + 2.6)} ${
      6 * Math.sin(angle + 2.6)
    } M ${x} ${y} l ${6 * Math.cos(angle - 2.6)} ${6 * Math.sin(angle - 2.6)}" stroke="black" stroke-width="1"/>`;

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textTransform = orientation === "vertical" ? `rotate(-90 ${midX} ${midY})` : "";
  const safeLabel = escapeXml(label);

  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="1"/>
    ${arrow(x1, y1, angle)}
    ${arrow(x2, y2, angle + Math.PI)}
    <rect x="${midX - label.length * 3.6 - 4}" y="${midY - 9}" width="${label.length * 7.2 + 8}" height="14" fill="white" transform="${textTransform}"/>
    <text x="${midX}" y="${midY + 1}" font-size="11" text-anchor="middle" dominant-baseline="middle" transform="${textTransform}">${safeLabel}</text>
  `;
}

export function extensionLine(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="0.5" stroke-dasharray="1,2"/>`;
}

export function northArrow(x: number, y: number): string {
  return `
    <g transform="translate(${x} ${y})">
      <path d="M 0 -18 L 6 6 L 0 1 L -6 6 Z" fill="black"/>
      <text x="0" y="20" font-size="12" text-anchor="middle" font-weight="600">N</text>
    </g>
  `;
}

// A graphical scale bar (skalstock) - alternating filled/unfilled metre
// segments with tick labels - distinct from a text "1:100" note.
export function scaleBar(x: number, y: number, meters = 5): string {
  const segments = Array.from({ length: meters }, (_, i) => {
    const segX = x + i * PX_PER_METER;
    const fill = i % 2 === 0 ? "black" : "white";
    return `<rect x="${segX}" y="${y}" width="${PX_PER_METER}" height="6" fill="${fill}" stroke="black" stroke-width="0.75"/>`;
  }).join("\n");

  const labels = Array.from({ length: meters + 1 }, (_, i) => {
    const labelX = x + i * PX_PER_METER;
    return `<text x="${labelX}" y="${y + 18}" font-size="8" text-anchor="middle">${i}</text>`;
  }).join("\n");

  return `
    <g>
      ${segments}
      ${labels}
      <text x="${x}" y="${y - 4}" font-size="8" fill="#666">Skalstock (m)</text>
    </g>
  `;
}

// Ground datum line with a simple below-grade hatch, the standard
// architectural symbol for "anslutning till marknivå".
export function groundLine(x1: number, x2: number, y: number, label = "Marknivå ±0,00"): string {
  const hatchCount = Math.max(4, Math.round((x2 - x1) / 20));
  const hatches = Array.from({ length: hatchCount }, (_, i) => {
    const hx = x1 + (i * (x2 - x1)) / (hatchCount - 1 || 1);
    return `<line x1="${hx}" y1="${y}" x2="${hx - 6}" y2="${y + 8}" stroke="black" stroke-width="0.75"/>`;
  }).join("\n");

  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="black" stroke-width="1.5"/>
    ${hatches}
    <text x="${x1 - 6}" y="${y + 4}" font-size="9" text-anchor="end">${escapeXml(label)}</text>
  `;
}

export function titleBlock(params: {
  svgWidth: number;
  svgHeight: number;
  margin: number;
  heading: string;
  note: string;
  propertyDesignation?: string;
}): string {
  const { svgWidth, svgHeight, margin, heading, note, propertyDesignation } = params;
  return `
    <g font-size="10" fill="#333">
      <line x1="0" y1="${svgHeight - 42}" x2="${svgWidth}" y2="${svgHeight - 42}" stroke="black" stroke-width="0.5"/>
      <text x="${margin}" y="${svgHeight - 26}" font-weight="600">${escapeXml(heading)}</text>
      ${
        propertyDesignation
          ? `<text x="${margin}" y="${svgHeight - 12}">Fastighet: ${escapeXml(propertyDesignation)}</text>`
          : ""
      }
      <text x="${margin}" y="${svgHeight - 4}" font-size="8" fill="#888">${escapeXml(note)}</text>
    </g>
  `;
}
