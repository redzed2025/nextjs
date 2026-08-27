import type { BoardLayout, BoardSpec } from "./types";
import { CAPTION_HEIGHT } from "./layout";

/** Version of the document format the companion plugin understands. */
export const FIGMA_DOC_VERSION = 1;

export type FigmaColor = { r: number; g: number; b: number };

export type FigmaImageNode = {
  type: "IMAGE";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  /** Source image, used when `imageBase64` is absent. */
  imageUrl: string;
  /** Image bytes, base64 encoded, so the plugin can run without network access. */
  imageBase64?: string;
  /** Fill shown if the image cannot be loaded. */
  fallbackColor: FigmaColor;
  /** Link back to the pin, attached as a hyperlink-ish plugin data field. */
  sourceUrl?: string;
};

export type FigmaTextNode = {
  type: "TEXT";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  characters: string;
  fontSize: number;
  color: FigmaColor;
};

export type FigmaNode = FigmaImageNode | FigmaTextNode;

export type FigmaDocument = {
  version: typeof FIGMA_DOC_VERSION;
  generator: "pinterest-to-figma";
  name: string;
  frame: {
    width: number;
    height: number;
    background: FigmaColor;
    padding: number;
  };
  nodes: FigmaNode[];
};

/** Converts `#rrggbb` (or `#rgb`) to Figma's 0–1 RGB triple. */
export function hexToFigmaColor(hex: string): FigmaColor {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 1, g: 1, b: 1 };

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * Builds the node tree the Figma plugin replays. Unlike the SVG export this
 * keeps pin identity and source links, so the result is editable Figma layers
 * rather than a flattened vector import.
 */
export function buildFigmaDocument(
  spec: BoardSpec,
  layout: BoardLayout,
  images: Map<string, string>,
): FigmaDocument {
  const nodes: FigmaNode[] = [];

  for (const [index, cell] of layout.cells.entries()) {
    const name = cell.pin.title?.replace(/\s+/g, " ").trim() || `Pin ${index + 1}`;
    const base64 = images.get(cell.pin.imageUrl);

    nodes.push({
      type: "IMAGE",
      name,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.imageHeight,
      cornerRadius: Math.max(0, spec.cornerRadius),
      imageUrl: cell.pin.imageUrl,
      imageBase64: base64,
      fallbackColor: hexToFigmaColor(cell.pin.dominantColor ?? "#e9e4dd"),
      sourceUrl: cell.pin.sourceUrl,
    });

    if (spec.showCaptions && cell.pin.title) {
      nodes.push({
        type: "TEXT",
        name: `${name} caption`,
        x: cell.x,
        y: cell.y + cell.imageHeight + 6,
        width: cell.width,
        height: CAPTION_HEIGHT - 6,
        characters: cell.pin.title.replace(/\s+/g, " ").trim(),
        fontSize: 12,
        color: hexToFigmaColor("#6b6560"),
      });
    }
  }

  return {
    version: FIGMA_DOC_VERSION,
    generator: "pinterest-to-figma",
    name: spec.title,
    frame: {
      width: layout.width,
      height: layout.height,
      background: hexToFigmaColor(spec.background),
      padding: spec.padding,
    },
    nodes,
  };
}
