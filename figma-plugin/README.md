# Pinterest → Figma importer plugin

Rebuilds a board exported from the web app as editable Figma layers: one frame
for the board, one image-filled rectangle per pin, plus optional caption text.

## Install it locally

1. In the web app, click **Download plugin document** to get a `.figma.json` file.
2. In the Figma desktop app, open **Plugins → Development → Import plugin from
   manifest…** and pick `figma-plugin/manifest.json` from this repo.
3. Run **Plugins → Development → Pinterest to Figma**, then drop the
   `.figma.json` file onto the plugin window.

## SVG vs. plugin document

| | SVG export | Plugin document |
| --- | --- | --- |
| Import | Drag the file onto the canvas | Run this plugin |
| Result | A vector group Figma flattens on import | A named frame with rectangles and text layers |
| Image fills | Embedded, editable after ungrouping | Native image fills from the start |
| Layer names | Generic | Pin titles |
| Pin source links | Not preserved | Stored as `pinterestSourceUrl` plugin data |

Use the SVG when you just want the moodboard on a canvas. Use the plugin when
you intend to keep working with the layers.

## Notes

- Image bytes are embedded in the document, so the plugin normally needs no
  network access. If a pin failed to download during export, the plugin falls
  back to fetching it from `i.pinimg.com` and, failing that, fills the rectangle
  with the pin's dominant colour.
- `code.js` is plain ES2017 JavaScript with no build step, so the manifest can
  point straight at it.
