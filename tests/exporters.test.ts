import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFigmaDocument, hexToFigmaColor } from "../lib/figma-doc";
import { layoutBoard } from "../lib/layout";
import { escapeXml, renderBoardSvg } from "../lib/svg";
import { readImageSize } from "../lib/image-size";
import { InvalidBoardError, exportFilename, parseBoardSpec } from "../lib/board";
import type { BoardSpec, Pin } from "../lib/types";

const pins: Pin[] = [
  {
    id: "one",
    imageUrl: "https://i.pinimg.com/originals/one.jpg",
    title: "A <pin> & friends",
    width: 100,
    height: 100,
  },
  { id: "two", imageUrl: "https://i.pinimg.com/originals/two.jpg", width: 100, height: 200 },
];

const spec: BoardSpec = {
  title: "Kitchen",
  pins,
  columns: 2,
  columnWidth: 100,
  gap: 10,
  padding: 20,
  background: "#faf7f2",
  cornerRadius: 8,
  showCaptions: true,
};

describe("escapeXml", () => {
  it("escapes every XML-significant character", () => {
    assert.equal(escapeXml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });
});

describe("renderBoardSvg", () => {
  const layout = layoutBoard(spec);

  it("embeds fetched images as data URIs under both href spellings", () => {
    const svg = renderBoardSvg(
      spec,
      layout,
      new Map([[pins[0].imageUrl, "data:image/jpeg;base64,AAAA"]]),
    );

    assert.ok(svg.startsWith("<svg "));
    assert.ok(svg.includes('href="data:image/jpeg;base64,AAAA"'));
    assert.ok(svg.includes('xlink:href="data:image/jpeg;base64,AAAA"'));
    assert.ok(svg.includes(`width="${layout.width}"`));
    assert.ok(svg.trimEnd().endsWith("</svg>"));
  });

  it("draws a placeholder rect for images that could not be fetched", () => {
    const svg = renderBoardSvg(spec, layout, new Map());
    assert.equal(svg.includes("<image"), false);
    assert.ok(svg.includes('fill="#e9e4dd"'));
  });

  it("escapes captions rather than injecting markup", () => {
    const svg = renderBoardSvg(spec, layout, new Map());
    assert.equal(svg.includes("<pin>"), false);
    assert.ok(svg.includes("&lt;pin&gt;"));
  });

  it("omits clip paths when the corner radius is zero", () => {
    const square = renderBoardSvg({ ...spec, cornerRadius: 0 }, layout, new Map());
    assert.equal(square.includes("clipPath"), false);
  });
});

describe("hexToFigmaColor", () => {
  it("converts long and short hex", () => {
    assert.deepEqual(hexToFigmaColor("#000000"), { r: 0, g: 0, b: 0 });
    assert.deepEqual(hexToFigmaColor("#fff"), { r: 1, g: 1, b: 1 });
  });

  it("falls back to white for nonsense", () => {
    assert.deepEqual(hexToFigmaColor("chartreuse"), { r: 1, g: 1, b: 1 });
  });
});

describe("buildFigmaDocument", () => {
  it("emits an image node per pin plus captions, tagged for the plugin", () => {
    const layout = layoutBoard(spec);
    const document = buildFigmaDocument(spec, layout, new Map([[pins[0].imageUrl, "AAAA"]]));

    assert.equal(document.generator, "pinterest-to-figma");
    assert.equal(document.version, 1);
    assert.equal(document.nodes.filter((node) => node.type === "IMAGE").length, 2);
    // Only the first pin has a title, so only it gets a caption.
    assert.equal(document.nodes.filter((node) => node.type === "TEXT").length, 1);

    const [first] = document.nodes;
    assert.equal(first.type, "IMAGE");
    assert.equal(first.type === "IMAGE" && first.imageBase64, "AAAA");
    assert.equal(document.frame.width, layout.width);
  });

  it("names untitled pins by position", () => {
    const document = buildFigmaDocument(
      { ...spec, showCaptions: false },
      layoutBoard({ ...spec, showCaptions: false }),
      new Map(),
    );
    assert.equal(document.nodes[1].name, "Pin 2");
  });
});

describe("parseBoardSpec", () => {
  it("clamps out-of-range numbers and keeps valid pins", () => {
    const parsed = parseBoardSpec({
      title: "  Board  ",
      columns: 999,
      columnWidth: -5,
      gap: "8",
      pins: [{ imageUrl: "https://i.pinimg.com/originals/a.jpg", width: 10, height: 20 }],
    });

    assert.equal(parsed.title, "Board");
    assert.equal(parsed.columns, 12);
    assert.equal(parsed.columnWidth, 80);
    assert.equal(parsed.gap, 8);
    assert.equal(parsed.pins.length, 1);
    assert.ok(parsed.pins[0].id.length > 0);
  });

  it("drops pins that are not Pinterest images", () => {
    assert.throws(
      () => parseBoardSpec({ pins: [{ imageUrl: "https://evil.test/a.jpg" }] }),
      InvalidBoardError,
    );
    assert.throws(
      () => parseBoardSpec({ pins: [{ imageUrl: "http://i.pinimg.com/a.jpg" }] }),
      InvalidBoardError,
    );
  });

  it("rejects a board with no pins", () => {
    assert.throws(() => parseBoardSpec({ pins: [] }), InvalidBoardError);
    assert.throws(() => parseBoardSpec("nope"), InvalidBoardError);
  });

  it("ignores a background that is not a hex colour", () => {
    assert.equal(
      parseBoardSpec({
        background: "javascript:alert(1)",
        pins: [{ imageUrl: "https://i.pinimg.com/originals/a.jpg" }],
      }).background,
      "#faf7f2",
    );
  });
});

describe("exportFilename", () => {
  it("slugifies the board title", () => {
    assert.equal(exportFilename("Warm Kitchen ✨", "svg"), "warm-kitchen.svg");
  });

  it("falls back when nothing survives slugification", () => {
    assert.equal(exportFilename("✨✨", "figma.json"), "moodboard.figma.json");
  });

  it("cuts a long title at a word boundary instead of mid-word", () => {
    const name = exportFilename(
      "Find your perfect place to call home real estate landing page",
      "figma.json",
    );
    assert.equal(name, "find-your-perfect-place-to-call-home-real-estate-landing.figma.json");
    assert.equal(name.includes("-pag."), false);
  });

  it("keeps a title that fits intact", () => {
    assert.equal(exportFilename("Warm kitchen", "svg"), "warm-kitchen.svg");
  });
});

describe("readImageSize", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    assert.deepEqual(readImageSize(png), { width: 640, height: 480 });
  });

  it("reads JPEG dimensions from the SOF0 marker", () => {
    // SOI, APP0 (length 4, skipped), SOF0 with height 300 / width 200.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c,
      0x00, 0xc8, 0x03, 0x01, 0x22, 0x00,
    ]);
    assert.deepEqual(readImageSize(jpeg), { width: 200, height: 300 });
  });

  it("reads GIF dimensions", () => {
    const gif = new Uint8Array(10);
    gif.set([..."GIF89a"].map((char) => char.charCodeAt(0)));
    new DataView(gif.buffer).setUint16(6, 120, true);
    new DataView(gif.buffer).setUint16(8, 90, true);
    assert.deepEqual(readImageSize(gif), { width: 120, height: 90 });
  });

  it("returns null for bytes it does not recognise", () => {
    assert.equal(readImageSize(new Uint8Array([1, 2, 3, 4])), null);
  });
});
