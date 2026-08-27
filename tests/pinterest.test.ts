import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPinsFromJson,
  extractPinsFromHtml,
  isDirectImageUrl,
  parseUrlList,
  pinimgVariants,
} from "../lib/pinterest";

describe("parseUrlList", () => {
  it("splits on whitespace and commas and drops duplicates", () => {
    const urls = parseUrlList("https://a.test/1\n https://a.test/2, https://a.test/1  ");
    assert.deepEqual(urls, ["https://a.test/1", "https://a.test/2"]);
  });

  it("returns nothing for blank input", () => {
    assert.deepEqual(parseUrlList("   \n  "), []);
  });
});

describe("pinimgVariants", () => {
  it("offers the other size segments for a pinimg URL", () => {
    const variants = pinimgVariants("https://i.pinimg.com/236x/ab/cd/ef/hash.jpg");
    assert.equal(variants[0], "https://i.pinimg.com/236x/ab/cd/ef/hash.jpg");
    assert.ok(variants.includes("https://i.pinimg.com/originals/ab/cd/ef/hash.jpg"));
    assert.ok(variants.includes("https://i.pinimg.com/736x/ab/cd/ef/hash.jpg"));
    // The current size is not offered twice.
    assert.equal(variants.filter((url) => url.includes("/236x/")).length, 1);
  });

  it("leaves non-pinimg and unrecognised paths alone", () => {
    assert.deepEqual(pinimgVariants("https://example.test/a.jpg"), ["https://example.test/a.jpg"]);
    assert.deepEqual(pinimgVariants("https://i.pinimg.com/nope/a.jpg"), [
      "https://i.pinimg.com/nope/a.jpg",
    ]);
    assert.deepEqual(pinimgVariants("not a url"), ["not a url"]);
  });
});

describe("isDirectImageUrl", () => {
  it("recognises CDN image links", () => {
    assert.equal(isDirectImageUrl("https://i.pinimg.com/originals/a/b/c.jpg"), true);
    assert.equal(isDirectImageUrl("https://i.pinimg.com/736x/a/b/c.WEBP"), true);
  });

  it("rejects pin pages and other hosts", () => {
    assert.equal(isDirectImageUrl("https://www.pinterest.com/pin/123/"), false);
    assert.equal(isDirectImageUrl("https://example.test/a.jpg"), false);
    assert.equal(isDirectImageUrl("nonsense"), false);
  });
});

describe("collectPinsFromJson", () => {
  it("finds pin-shaped objects at any depth and keeps the largest image", () => {
    const pins = collectPinsFromJson({
      props: {
        deeply: {
          nested: [
            {
              id: "8801",
              grid_title: "Warm kitchen",
              dominant_color: "#c8a37b",
              images: {
                "236x": { url: "https://i.pinimg.com/236x/a.jpg", width: 236, height: 314 },
                orig: { url: "https://i.pinimg.com/originals/a.jpg", width: 1000, height: 1333 },
              },
            },
          ],
        },
      },
    });

    const found = [...pins.values()];
    assert.equal(found.length, 1);
    assert.equal(found[0].imageUrl, "https://i.pinimg.com/originals/a.jpg");
    assert.equal(found[0].width, 1000);
    assert.equal(found[0].title, "Warm kitchen");
    assert.equal(found[0].dominantColor, "#c8a37b");
    assert.equal(found[0].sourceUrl, "https://www.pinterest.com/pin/8801/");
  });

  it("ignores objects whose images map has no usable url", () => {
    const pins = collectPinsFromJson({ images: { "236x": { width: 1 } }, other: { images: [] } });
    assert.equal(pins.size, 0);
  });

  it("deduplicates repeated images across the tree", () => {
    const entry = { images: { orig: { url: "https://i.pinimg.com/originals/dupe.jpg" } } };
    const pins = collectPinsFromJson({ a: entry, b: { ...entry } });
    assert.equal(pins.size, 1);
  });
});

describe("extractPinsFromHtml", () => {
  it("prefers embedded JSON state", () => {
    const html = `
      <html><head><title>Board | Pinterest</title>
      <meta property="og:image" content="https://i.pinimg.com/originals/og.jpg" />
      </head><body>
      <script id="__PWS_DATA__" type="application/json">
        {"pins":[{"id":"1","images":{"orig":{"url":"https://i.pinimg.com/originals/state.jpg","width":800,"height":600}}}]}
      </script>
      </body></html>`;

    const result = extractPinsFromHtml(html);
    assert.equal(result.pins.length, 1);
    assert.equal(result.pins[0].imageUrl, "https://i.pinimg.com/originals/state.jpg");
  });

  it("falls back to Open Graph tags", () => {
    const html = `
      <html><head>
      <meta property="og:title" content="A pin" />
      <meta property="og:image" content="https://i.pinimg.com/originals/og.jpg" />
      <meta property="og:image:width" content="640" />
      <meta property="og:image:height" content="480" />
      </head><body></body></html>`;

    const result = extractPinsFromHtml(html);
    assert.equal(result.pins.length, 1);
    assert.equal(result.pins[0].imageUrl, "https://i.pinimg.com/originals/og.jpg");
    assert.equal(result.pins[0].width, 640);
    assert.equal(result.pins[0].height, 480);
    assert.equal(result.title, "A pin");
  });

  it("falls back to raw CDN links in the markup", () => {
    const html = `<div data-src="https://i.pinimg.com/564x/aa/bb/cc.jpg"></div>`;
    const result = extractPinsFromHtml(html);
    assert.equal(result.pins.length, 1);
    assert.equal(result.pins[0].imageUrl, "https://i.pinimg.com/564x/aa/bb/cc.jpg");
  });

  it("survives a malformed JSON script block", () => {
    const html = `
      <script type="application/json">{"broken":</script>
      <meta property="og:image" content="https://i.pinimg.com/originals/ok.jpg" />`;
    const result = extractPinsFromHtml(html);
    assert.equal(result.pins.length, 1);
  });
});
