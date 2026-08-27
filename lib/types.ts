/** A single image scraped from Pinterest (or supplied directly as an image URL). */
export type Pin = {
  /** Stable id derived from the source URL. */
  id: string;
  /** Direct URL of the full-resolution image. */
  imageUrl: string;
  /** Page the image was found on, when it came from a Pinterest page. */
  sourceUrl?: string;
  title?: string;
  description?: string;
  /** Intrinsic size, when Pinterest advertised one. Filled in later otherwise. */
  width?: number;
  height?: number;
  /** Dominant colour Pinterest reports, used as a placeholder fill. */
  dominantColor?: string;
};

export type ExtractResult = {
  /** Title of the board or pin the URL pointed at. */
  boardTitle?: string;
  pins: Pin[];
  /** Non-fatal problems, e.g. one URL of several failed. */
  warnings: string[];
};

/** Everything the exporters need to render a board. */
export type BoardSpec = {
  title: string;
  pins: Pin[];
  columns: number;
  /** Width of a single column, in px. */
  columnWidth: number;
  /** Gap between cells, in px. */
  gap: number;
  /** Padding inside the board frame, in px. */
  padding: number;
  background: string;
  cornerRadius: number;
  /** Render the pin title under each image. */
  showCaptions: boolean;
};

/** One positioned cell produced by the layout engine. */
export type LayoutCell = {
  pin: Pin;
  x: number;
  y: number;
  width: number;
  /** Height of the image box (excludes the caption strip). */
  imageHeight: number;
  /** Total height of the cell, image plus caption strip. */
  height: number;
};

export type BoardLayout = {
  cells: LayoutCell[];
  width: number;
  height: number;
};
