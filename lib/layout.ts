import type { BoardLayout, BoardSpec, LayoutCell } from "./types";

/** Height reserved under an image when captions are on. */
export const CAPTION_HEIGHT = 28;

/** Aspect ratio used for pins whose intrinsic size Pinterest did not report. */
const FALLBACK_ASPECT = 3 / 4;

/** Keeps absurd panoramas and skyscrapers from wrecking the columns. */
const MIN_ASPECT = 0.2;
const MAX_ASPECT = 3;

export function aspectRatio(pin: { width?: number; height?: number }): number {
  if (!pin.width || !pin.height || pin.width <= 0 || pin.height <= 0) {
    return FALLBACK_ASPECT;
  }
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, pin.width / pin.height));
}

/**
 * Masonry packing: each pin goes into whichever column is currently shortest,
 * which is the layout Pinterest itself uses and what reads as a moodboard once
 * it lands in Figma.
 */
export function layoutBoard(spec: BoardSpec): BoardLayout {
  const columns = Math.max(1, Math.floor(spec.columns));
  const columnWidth = Math.max(1, spec.columnWidth);
  const gap = Math.max(0, spec.gap);
  const padding = Math.max(0, spec.padding);
  const captionHeight = spec.showCaptions ? CAPTION_HEIGHT : 0;

  const columnHeights = new Array<number>(columns).fill(0);
  const cells: LayoutCell[] = [];

  for (const pin of spec.pins) {
    let shortest = 0;
    for (let i = 1; i < columns; i++) {
      if (columnHeights[i] < columnHeights[shortest] - 0.001) shortest = i;
    }

    const imageHeight = Math.round(columnWidth / aspectRatio(pin));
    const height = imageHeight + captionHeight;

    cells.push({
      pin,
      x: padding + shortest * (columnWidth + gap),
      y: padding + columnHeights[shortest],
      width: columnWidth,
      imageHeight,
      height,
    });

    columnHeights[shortest] += height + gap;
  }

  const contentHeight = Math.max(0, Math.max(...columnHeights, 0) - gap);
  const contentWidth = columns * columnWidth + (columns - 1) * gap;

  return {
    cells,
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2,
  };
}
