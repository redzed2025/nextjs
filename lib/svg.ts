import type { BoardLayout, BoardSpec } from "./types";
import { CAPTION_HEIGHT } from "./layout";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Trims a caption so it roughly fits the column instead of overflowing it. */
function truncate(value: string, columnWidth: number): string {
  const maxChars = Math.max(8, Math.floor(columnWidth / 7));
  const single = value.replace(/\s+/g, " ").trim();
  return single.length <= maxChars ? single : `${single.slice(0, maxChars - 1)}…`;
}

/**
 * Renders the board as a single self-contained SVG. Images are inlined as data
 * URIs, which is what makes the file importable into Figma by drag and drop —
 * Figma turns each `<image>` into a frame with an image fill.
 */
export function renderBoardSvg(
  spec: BoardSpec,
  layout: BoardLayout,
  images: Map<string, string>,
): string {
  const radius = Math.max(0, spec.cornerRadius);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${layout.width}" height="${layout.height}" ` +
      `viewBox="0 0 ${layout.width} ${layout.height}">`,
  );
  parts.push(`<title>${escapeXml(spec.title)}</title>`);

  if (radius > 0) {
    parts.push("<defs>");
    for (const [index, cell] of layout.cells.entries()) {
      parts.push(
        `<clipPath id="clip-${index}"><rect x="${cell.x}" y="${cell.y}" ` +
          `width="${cell.width}" height="${cell.imageHeight}" rx="${radius}" ry="${radius}"/></clipPath>`,
      );
    }
    parts.push("</defs>");
  }

  parts.push(
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${escapeXml(spec.background)}"/>`,
  );

  for (const [index, cell] of layout.cells.entries()) {
    const href = images.get(cell.pin.imageUrl);
    const clip = radius > 0 ? ` clip-path="url(#clip-${index})"` : "";

    if (href) {
      parts.push(
        `<image${clip} x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.imageHeight}" ` +
          `preserveAspectRatio="xMidYMid slice" href="${escapeXml(href)}" xlink:href="${escapeXml(href)}"/>`,
      );
    } else {
      // The image could not be fetched; keep the cell so the layout still reads.
      parts.push(
        `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.imageHeight}" ` +
          `rx="${radius}" ry="${radius}" fill="${escapeXml(cell.pin.dominantColor ?? "#e9e4dd")}"/>`,
      );
    }

    if (spec.showCaptions && cell.pin.title) {
      parts.push(
        `<text x="${cell.x}" y="${cell.y + cell.imageHeight + CAPTION_HEIGHT - 10}" ` +
          `font-family="Inter, Helvetica, Arial, sans-serif" font-size="12" fill="#6b6560">` +
          `${escapeXml(truncate(cell.pin.title, cell.width))}</text>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}
