# Pinterest → Figma

Turns Pinterest boards and pins into a moodboard you can bring into Figma —
either as a self-contained SVG you drag onto the canvas, or as a document the
companion plugin rebuilds as editable layers.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests
npm run lint
npm run build
```

## How it works

1. **Paste URLs.** Board URLs, pin URLs, or direct `i.pinimg.com` image links,
   one per line. `POST /api/extract` fetches each page server-side and pulls
   pins out of Pinterest's embedded JSON state, falling back to Open Graph tags
   and then to raw CDN links in the markup.
2. **Arrange.** Pick which pins belong on the board and set columns, column
   width, gap, padding, corner radius, background, and captions. The preview is
   laid out at true export coordinates and scaled down, so it matches the file
   you get.
3. **Export.** `POST /api/export` downloads every image once, feeds real aspect
   ratios back into the layout, and emits one of two formats.

### The two export formats

| | `Download SVG` | `Download plugin document` |
| --- | --- | --- |
| Getting it into Figma | Drag the file onto the canvas | Run the plugin in `figma-plugin/` |
| What you get | A vector group with embedded image fills | A named frame of rectangles and text layers |
| Layer names | Generic | Pin titles |
| Pin source links | Dropped | Kept as `pinterestSourceUrl` plugin data |

The SVG embeds every image as a `data:` URI, so the file works offline and
Figma turns each `<image>` into an image fill on import. See
[`figma-plugin/README.md`](figma-plugin/README.md) for the plugin.

## Layout

`lib/layout.ts` packs pins into whichever column is currently shortest — the
same masonry Pinterest uses. Pins whose intrinsic size Pinterest did not report
get measured two ways: the browser reports `naturalWidth`/`naturalHeight` for
the preview, and the exporter reads the dimensions out of the image header
(`lib/image-size.ts`) so the exported file does not depend on the browser having
loaded anything.

## Fetching and safety

Every server-side fetch goes through `lib/net.ts`, which:

- allows `https` only,
- restricts requests to Pinterest and `pinimg.com` hosts,
- refuses hostnames that resolve to loopback, link-local, or private ranges,
- re-checks all of the above at each redirect hop, and
- applies a request timeout.

`lib/board.ts` validates and clamps the board payload before the exporter
touches it, so a hand-crafted request cannot ask for a 40,000-pixel board or
point the exporter at an arbitrary image host. Per-image and per-export byte
caps live in `lib/images.ts`.

Pinterest gates a lot of pages behind bot detection and rate limits. When a
board URL returns nothing, the extractor says so and individual pin URLs
usually still work.

## Layout of the repo

```
app/
  api/extract/route.ts   URL(s) -> pins
  api/image/route.ts     guarded image proxy for the preview
  api/export/route.ts    board -> SVG or plugin document
  components/            client UI
lib/
  net.ts                 allowlist + private-IP guard + redirect-safe fetch
  pinterest.ts           URL parsing and HTML/JSON pin extraction
  images.ts              bounded, concurrent image downloads
  image-size.ts          PNG/JPEG/GIF/WebP header dimension reader
  layout.ts              masonry packing
  svg.ts                 SVG exporter
  figma-doc.ts           plugin document exporter
  board.ts               untrusted-payload validation
figma-plugin/            companion Figma plugin (no build step)
tests/                   node:test unit tests
```
