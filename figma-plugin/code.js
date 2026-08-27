/**
 * Rebuilds a board exported by the Pinterest → Figma converter as real Figma
 * layers: one frame per board, one image-filled rectangle per pin.
 *
 * The UI reads the `.figma.json` file and hands the parsed document over; all
 * node creation happens here, on the plugin's main thread.
 */

const SUPPORTED_VERSION = 1;
const CAPTION_FONT = { family: "Inter", style: "Regular" };

figma.showUI(__html__, { width: 360, height: 320, themeColors: true });

/** Decodes a base64 string into the byte array `createImage` expects. */
function base64ToBytes(base64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));

  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (alphabet.indexOf(clean[i]) << 18) |
      (alphabet.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]) : 0);

    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < bytes.length) bytes[byteIndex++] = chunk & 0xff;
  }
  return bytes;
}

/** Resolves a node's image, preferring embedded bytes over a network fetch. */
async function resolveImage(node) {
  if (node.imageBase64) {
    return figma.createImage(base64ToBytes(node.imageBase64));
  }
  if (node.imageUrl) {
    return figma.createImageAsync(node.imageUrl);
  }
  return null;
}

async function createImageNode(node) {
  const rect = figma.createRectangle();
  rect.name = node.name || "Pin";
  rect.resize(Math.max(1, node.width), Math.max(1, node.height));
  rect.x = node.x;
  rect.y = node.y;
  rect.cornerRadius = node.cornerRadius || 0;

  try {
    const image = await resolveImage(node);
    if (image) {
      rect.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
    } else {
      rect.fills = [{ type: "SOLID", color: node.fallbackColor }];
    }
  } catch (error) {
    // A single unreachable image should not abort the whole import.
    rect.fills = [{ type: "SOLID", color: node.fallbackColor }];
    console.warn(`Could not load image for "${rect.name}":`, error);
  }

  if (node.sourceUrl) {
    rect.setPluginData("pinterestSourceUrl", node.sourceUrl);
  }
  return rect;
}

async function createTextNode(node) {
  await figma.loadFontAsync(CAPTION_FONT);
  const text = figma.createText();
  text.fontName = CAPTION_FONT;
  text.name = node.name || "Caption";
  text.characters = node.characters;
  text.fontSize = node.fontSize;
  text.fills = [{ type: "SOLID", color: node.color }];
  text.textAutoResize = "HEIGHT";
  text.resize(Math.max(1, node.width), Math.max(1, node.height));
  text.x = node.x;
  text.y = node.y;
  return text;
}

function validate(document) {
  if (!document || typeof document !== "object") {
    throw new Error("That file is not a converter export.");
  }
  if (document.generator !== "pinterest-to-figma") {
    throw new Error("That file was not produced by the Pinterest → Figma converter.");
  }
  if (document.version !== SUPPORTED_VERSION) {
    throw new Error(
      `This plugin understands document version ${SUPPORTED_VERSION}, but the file is version ${document.version}.`,
    );
  }
  if (!Array.isArray(document.nodes) || document.nodes.length === 0) {
    throw new Error("The document contains no pins.");
  }
}

async function importDocument(document) {
  validate(document);

  const frame = figma.createFrame();
  frame.name = document.name || "Pinterest board";
  frame.resize(Math.max(1, document.frame.width), Math.max(1, document.frame.height));
  frame.fills = [{ type: "SOLID", color: document.frame.background }];
  frame.clipsContent = true;

  // Place the board to the right of whatever is already on the page.
  const existing = figma.currentPage.children;
  frame.x = existing.length > 0 ? Math.max(...existing.map((n) => n.x + n.width)) + 120 : 0;
  frame.y = 0;

  let imported = 0;
  for (const node of document.nodes) {
    const child = node.type === "TEXT" ? await createTextNode(node) : await createImageNode(node);
    frame.appendChild(child);
    // Coordinates in the document are frame-relative.
    child.x = node.x;
    child.y = node.y;
    imported++;
    figma.ui.postMessage({ type: "progress", done: imported, total: document.nodes.length });
  }

  figma.currentPage.appendChild(frame);
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  return imported;
}

figma.ui.onmessage = async (message) => {
  if (!message || message.type !== "import") return;

  try {
    const imported = await importDocument(message.document);
    figma.ui.postMessage({ type: "done", imported });
    figma.notify(`Imported ${imported} layer${imported === 1 ? "" : "s"}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Import failed.";
    figma.ui.postMessage({ type: "error", message: detail });
    figma.notify(detail, { error: true });
  }
};
