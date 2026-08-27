/**
 * Minimal intrinsic-size reader for the formats Pinterest serves. Pin metadata
 * often omits dimensions, and without them every cell falls back to the same
 * aspect ratio and the masonry layout stops looking like the board.
 */
export type ImageSize = { width: number; height: number };

function readPng(buffer: Uint8Array): ImageSize | null {
  if (buffer.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((byte, i) => buffer[i] !== byte)) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readGif(buffer: Uint8Array): ImageSize | null {
  if (buffer.length < 10) return null;
  const header = String.fromCharCode(...buffer.subarray(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function readJpeg(buffer: Uint8Array): ImageSize | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    // SOF0–SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readWebp(buffer: Uint8Array): ImageSize | null {
  if (buffer.length < 30) return null;
  if (String.fromCharCode(...buffer.subarray(0, 4)) !== "RIFF") return null;
  if (String.fromCharCode(...buffer.subarray(8, 12)) !== "WEBP") return null;

  const chunk = String.fromCharCode(...buffer.subarray(12, 16));
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (chunk === "VP8X") {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }
  if (chunk === "VP8 ") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Reads intrinsic dimensions from an image's header bytes, or null. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  for (const reader of [readPng, readJpeg, readGif, readWebp]) {
    const size = reader(bytes);
    if (size && size.width > 0 && size.height > 0) return size;
  }
  return null;
}
