import { createHash } from "node:crypto";
import type { ExtractResult, Pin } from "./types";
import { isAllowedHost, safeFetch } from "./net";

const PINIMG_SIZE_SEGMENT = /^\/(originals|\d+x\d*)\//;

/** Stable id for a pin, so re-extracting the same board keeps selections. */
export function pinId(imageUrl: string): string {
  return createHash("sha1").update(imageUrl).digest("hex").slice(0, 12);
}

/**
 * Pinterest serves the same image at several widths under a size segment in the
 * path. Returns the candidates from best to worst so a fetch can fall back when
 * `originals` is missing.
 */
export function pinimgVariants(imageUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return [imageUrl];
  }
  if (!url.hostname.endsWith("pinimg.com")) return [imageUrl];

  const match = url.pathname.match(PINIMG_SIZE_SEGMENT);
  if (!match) return [imageUrl];

  const current = match[1];
  const rest = url.pathname.slice(match[0].length);
  const sizes = ["originals", "1200x", "736x", "564x", "474x"];
  const candidates = sizes.filter((size) => size !== current);

  return [
    imageUrl,
    ...candidates.map((size) => {
      const next = new URL(url);
      next.pathname = `/${size}/${rest}`;
      return next.toString();
    }),
  ];
}

/** Roughly how big an image is, used to prefer the largest known variant. */
function area(entry: unknown): number {
  if (!entry || typeof entry !== "object") return 0;
  const record = entry as Record<string, unknown>;
  const width = typeof record.width === "number" ? record.width : 0;
  const height = typeof record.height === "number" ? record.height : 0;
  return width * height;
}

type RawImages = Record<string, { url?: string; width?: number; height?: number }>;

/** Picks the largest entry out of a Pinterest `images` map. */
function bestImage(images: RawImages): { url: string; width?: number; height?: number } | null {
  let best: { url: string; width?: number; height?: number } | null = null;
  let bestArea = -1;
  for (const entry of Object.values(images)) {
    if (!entry || typeof entry.url !== "string") continue;
    const entryArea = area(entry);
    if (entryArea > bestArea) {
      bestArea = entryArea;
      best = { url: entry.url, width: entry.width, height: entry.height };
    }
  }
  return best;
}

function looksLikePin(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const images = record.images;
  if (!images || typeof images !== "object" || Array.isArray(images)) return false;
  return Object.values(images as RawImages).some(
    (entry) => entry && typeof entry === "object" && typeof entry.url === "string",
  );
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Walks an arbitrary JSON blob collecting anything shaped like a pin. Pinterest
 * moves its state around between releases, so shape-matching survives longer
 * than reaching into a fixed path.
 */
export function collectPinsFromJson(root: unknown, into: Map<string, Pin> = new Map()): Map<string, Pin> {
  const stack: unknown[] = [root];
  let visited = 0;

  while (stack.length > 0 && visited < 200_000) {
    const node = stack.pop();
    visited++;
    if (!node || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }

    const record = node as Record<string, unknown>;
    if (looksLikePin(record)) {
      const image = bestImage(record.images as RawImages);
      if (image && !into.has(image.url)) {
        into.set(image.url, {
          id: pinId(image.url),
          imageUrl: image.url,
          sourceUrl: typeof record.id === "string" ? `https://www.pinterest.com/pin/${record.id}/` : undefined,
          title: text(record.grid_title) ?? text(record.title) ?? text(record.seo_alt_text),
          description: text(record.description) ?? text(record.auto_alt_text),
          width: image.width,
          height: image.height,
          dominantColor: text(record.dominant_color),
        });
      }
    }

    for (const child of Object.values(record)) stack.push(child);
  }

  return into;
}

/** Pulls every `<script type="application/json">` payload out of a page. */
export function jsonScriptBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Truncated or non-JSON payload; skip it.
    }
  }
  return blocks;
}

function metaContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match) return text(match[1]);

  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
    "i",
  );
  return text(html.match(reversed)?.[1]);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

/** Extracts every pin a Pinterest HTML page exposes, best source first. */
export function extractPinsFromHtml(html: string): { title?: string; pins: Pin[] } {
  const found = new Map<string, Pin>();

  for (const block of jsonScriptBlocks(html)) {
    collectPinsFromJson(block, found);
  }

  // Fall back to Open Graph, which single pin pages always carry.
  if (found.size === 0) {
    const ogImage = metaContent(html, "og:image");
    if (ogImage) {
      const url = decodeEntities(ogImage);
      const width = Number(metaContent(html, "og:image:width"));
      const height = Number(metaContent(html, "og:image:height"));
      found.set(url, {
        id: pinId(url),
        imageUrl: url,
        title: metaContent(html, "og:title"),
        description: metaContent(html, "og:description"),
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined,
      });
    }
  }

  // Last resort: raw CDN links in the markup.
  if (found.size === 0) {
    const pattern = /https:\/\/i\.pinimg\.com\/(?:originals|\d+x\d*)\/[^\s"'\\<>]+\.(?:jpe?g|png|webp|gif)/gi;
    for (const raw of html.match(pattern) ?? []) {
      const url = decodeEntities(raw);
      if (!found.has(url)) found.set(url, { id: pinId(url), imageUrl: url });
    }
  }

  const title =
    metaContent(html, "og:title") ??
    text(decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));

  return { title, pins: [...found.values()] };
}

/** True when the URL points straight at an image rather than a Pinterest page. */
export function isDirectImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.hostname.endsWith("pinimg.com") && /\.(jpe?g|png|webp|gif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Splits pasted text into candidate URLs, one per line or whitespace run. */
export function parseUrlList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((piece) => piece.trim())
        .filter((piece) => piece.length > 0),
    ),
  ];
}

/**
 * Resolves pasted Pinterest URLs into pins. Direct image links are used as-is;
 * pin and board pages are fetched and scraped.
 */
export async function extractFromUrls(urls: string[]): Promise<ExtractResult> {
  const pins = new Map<string, Pin>();
  const warnings: string[] = [];
  let boardTitle: string | undefined;

  for (const raw of urls) {
    if (isDirectImageUrl(raw)) {
      if (!pins.has(raw)) pins.set(raw, { id: pinId(raw), imageUrl: raw });
      continue;
    }

    let hostname: string;
    try {
      hostname = new URL(raw).hostname;
    } catch {
      warnings.push(`Skipped "${raw}": not a valid URL.`);
      continue;
    }
    if (!isAllowedHost(hostname)) {
      warnings.push(`Skipped ${hostname}: only Pinterest URLs are supported.`);
      continue;
    }

    try {
      const response = await safeFetch(raw, { headers: { accept: "text/html" } });
      if (!response.ok) {
        warnings.push(`${raw} returned HTTP ${response.status}.`);
        continue;
      }
      const html = await response.text();
      const page = extractPinsFromHtml(html);
      if (page.pins.length === 0) {
        warnings.push(
          `No images found at ${raw}. Pinterest may be gating this page; try pasting individual pin URLs.`,
        );
        continue;
      }
      boardTitle ??= page.title?.replace(/\s*\|\s*Pinterest\s*$/i, "").trim() || undefined;
      for (const pin of page.pins) {
        if (!pins.has(pin.imageUrl)) pins.set(pin.imageUrl, pin);
      }
    } catch (error) {
      warnings.push(`${raw}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }

  return { boardTitle, pins: [...pins.values()], warnings };
}
