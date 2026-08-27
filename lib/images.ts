import type { Pin } from "./types";
import { safeFetch } from "./net";
import { pinimgVariants } from "./pinterest";
import { readImageSize } from "./image-size";

/** Per-image cap; Pinterest originals are well under this. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** Cap on a whole export, so one board cannot exhaust memory. */
export const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

const CONCURRENCY = 6;

export type FetchedImage = {
  bytes: Uint8Array;
  contentType: string;
  /** The variant URL that actually served the bytes. */
  resolvedUrl: string;
  width?: number;
  height?: number;
};

function contentTypeFor(response: Response, url: string): string {
  const header = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (header?.startsWith("image/")) return header;
  const extension = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

/** `full` embeds the best available bytes; `preview` keeps the UI light. */
export type ImageQuality = "full" | "preview";

/** Size segments to try first, best match to worst, per quality. */
const PREFERRED_SIZES: Record<ImageQuality, string[]> = {
  full: ["/originals/", "/1200x/", "/736x/"],
  preview: ["/474x/", "/564x/", "/736x/"],
};

/**
 * Fetches an image, trying the Pinterest size variants that suit the requested
 * quality first and falling back to the URL as given. Rejects non-images and
 * anything over the size cap.
 */
export async function fetchImage(
  imageUrl: string,
  quality: ImageQuality = "full",
): Promise<FetchedImage> {
  const candidates = pinimgVariants(imageUrl);
  let lastError: Error | null = null;

  const preferred = PREFERRED_SIZES[quality];
  const rank = (url: string) => {
    const index = preferred.findIndex((segment) => url.includes(segment));
    return index === -1 ? preferred.length : index;
  };
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b));

  for (const candidate of ordered) {
    try {
      const response = await safeFetch(candidate, { headers: { accept: "image/*" } });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        throw new Error("Image is too large to embed.");
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error("Image is too large to embed.");
      }

      const size = readImageSize(bytes);
      return {
        bytes,
        contentType: contentTypeFor(response, candidate),
        resolvedUrl: candidate,
        width: size?.width,
        height: size?.height,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("fetch failed");
    }
  }

  throw lastError ?? new Error(`Could not fetch ${imageUrl}`);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export type ImagePayload = {
  /** `data:` URI for SVG embedding. */
  dataUri: string;
  /** Raw base64 for the Figma plugin. */
  base64: string;
  width?: number;
  height?: number;
};

/** Runs `worker` over `items` with a bounded number of in-flight requests. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export type LoadedImages = {
  /** Keyed by the pin's original `imageUrl`. */
  payloads: Map<string, ImagePayload>;
  /** Pins with intrinsic sizes filled in from the fetched bytes. */
  pins: Pin[];
  warnings: string[];
};

/**
 * Downloads every pin's image once and returns both the encoded payloads and
 * the pins with real dimensions, which the layout engine needs.
 */
export async function loadImages(pins: Pin[]): Promise<LoadedImages> {
  const payloads = new Map<string, ImagePayload>();
  const warnings: string[] = [];
  let total = 0;

  const results = await mapWithConcurrency(pins, CONCURRENCY, async (pin) => {
    try {
      return { pin, image: await fetchImage(pin.imageUrl) };
    } catch (error) {
      return {
        pin,
        error: error instanceof Error ? error.message : "fetch failed",
      };
    }
  });

  const resolved: Pin[] = [];

  for (const result of results) {
    if (!("image" in result) || !result.image) {
      warnings.push(`${result.pin.imageUrl}: ${"error" in result ? result.error : "fetch failed"}`);
      resolved.push(result.pin);
      continue;
    }

    total += result.image.bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) {
      warnings.push("Export truncated: total image size exceeded the limit.");
      resolved.push(result.pin);
      continue;
    }

    const base64 = toBase64(result.image.bytes);
    payloads.set(result.pin.imageUrl, {
      dataUri: `data:${result.image.contentType};base64,${base64}`,
      base64,
      width: result.image.width,
      height: result.image.height,
    });

    resolved.push({
      ...result.pin,
      width: result.pin.width ?? result.image.width,
      height: result.pin.height ?? result.image.height,
    });
  }

  return { payloads, pins: resolved, warnings };
}
