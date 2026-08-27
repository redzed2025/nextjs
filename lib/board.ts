import type { BoardSpec, Pin } from "./types";
import { pinId } from "./pinterest";
import { BOARD_DEFAULTS, LIMITS } from "./board-defaults";

export { BOARD_DEFAULTS, LIMITS };

export class InvalidBoardError extends Error {}

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function optionalString(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxLength);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function parsePin(value: unknown): Pin | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const imageUrl = optionalString(record.imageUrl, 2048);
  if (!imageUrl) return null;

  let hostname: string;
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:") return null;
    hostname = url.hostname;
  } catch {
    return null;
  }
  if (!hostname.endsWith("pinimg.com") && !hostname.endsWith("pinterest.com")) return null;

  const width = Number(record.width);
  const height = Number(record.height);

  return {
    id: optionalString(record.id, 64) ?? pinId(imageUrl),
    imageUrl,
    sourceUrl: optionalString(record.sourceUrl, 2048),
    title: optionalString(record.title, 200),
    description: optionalString(record.description, 500),
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
    dominantColor: isHexColor(record.dominantColor) ? record.dominantColor : undefined,
  };
}

/** Validates and clamps an untrusted board payload from the client. */
export function parseBoardSpec(value: unknown): BoardSpec {
  if (!value || typeof value !== "object") {
    throw new InvalidBoardError("Expected a board object.");
  }
  const record = value as Record<string, unknown>;

  const rawPins = Array.isArray(record.pins) ? record.pins : [];
  const pins = rawPins
    .slice(0, LIMITS.pins[1])
    .map(parsePin)
    .filter((pin): pin is Pin => pin !== null);

  if (pins.length < LIMITS.pins[0]) {
    throw new InvalidBoardError("Select at least one pin to export.");
  }

  return {
    title: optionalString(record.title, 120) ?? "Pinterest board",
    pins,
    columns: clamp(record.columns, LIMITS.columns, BOARD_DEFAULTS.columns),
    columnWidth: clamp(record.columnWidth, LIMITS.columnWidth, BOARD_DEFAULTS.columnWidth),
    gap: clamp(record.gap, LIMITS.gap, BOARD_DEFAULTS.gap),
    padding: clamp(record.padding, LIMITS.padding, BOARD_DEFAULTS.padding),
    cornerRadius: clamp(record.cornerRadius, LIMITS.cornerRadius, BOARD_DEFAULTS.cornerRadius),
    background: isHexColor(record.background) ? record.background.trim() : BOARD_DEFAULTS.background,
    showCaptions: record.showCaptions === true,
  };
}

const MAX_SLUG_LENGTH = 60;

/** Filesystem-safe name for a downloaded export. */
export function exportFilename(title: string, extension: string): string {
  const full = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slug = full.slice(0, MAX_SLUG_LENGTH);
  if (full.length > MAX_SLUG_LENGTH) {
    // Cut back to a word boundary rather than leaving a half word like "pag".
    const lastBreak = slug.lastIndexOf("-");
    if (lastBreak > 0) slug = slug.slice(0, lastBreak);
  }

  return `${slug || "moodboard"}.${extension}`;
}
