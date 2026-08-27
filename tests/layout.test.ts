import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTION_HEIGHT, aspectRatio, layoutBoard } from "../lib/layout";
import type { BoardSpec, Pin } from "../lib/types";

function pin(id: string, width?: number, height?: number): Pin {
  return { id, imageUrl: `https://i.pinimg.com/originals/${id}.jpg`, width, height };
}

function spec(overrides: Partial<BoardSpec> = {}): BoardSpec {
  return {
    title: "Test",
    pins: [],
    columns: 3,
    columnWidth: 100,
    gap: 10,
    padding: 20,
    background: "#ffffff",
    cornerRadius: 8,
    showCaptions: false,
    ...overrides,
  };
}

describe("aspectRatio", () => {
  it("uses the intrinsic ratio when both dimensions are known", () => {
    assert.equal(aspectRatio({ width: 200, height: 100 }), 2);
  });

  it("falls back to 3:4 when dimensions are missing", () => {
    assert.equal(aspectRatio({}), 0.75);
    assert.equal(aspectRatio({ width: 100 }), 0.75);
  });

  it("clamps extreme ratios so one pin cannot dominate a column", () => {
    assert.equal(aspectRatio({ width: 10000, height: 1 }), 3);
    assert.equal(aspectRatio({ width: 1, height: 10000 }), 0.2);
  });
});

describe("layoutBoard", () => {
  it("places pins across columns and reports the padded size", () => {
    const layout = layoutBoard(spec({ pins: [pin("a", 100, 100), pin("b", 100, 100), pin("c", 100, 100)] }));

    assert.equal(layout.cells.length, 3);
    assert.deepEqual(
      layout.cells.map((cell) => cell.x),
      [20, 130, 240],
    );
    assert.deepEqual(
      layout.cells.map((cell) => cell.y),
      [20, 20, 20],
    );
    // 3 columns of 100 + 2 gaps of 10 + 2 paddings of 20.
    assert.equal(layout.width, 360);
    assert.equal(layout.height, 140);
  });

  it("sends the next pin to the shortest column", () => {
    const layout = layoutBoard(
      spec({
        columns: 2,
        pins: [pin("tall", 100, 200), pin("short", 100, 50), pin("next", 100, 100)],
      }),
    );

    // "tall" is 200px, "short" is 50px, so "next" joins the short column.
    assert.equal(layout.cells[2].x, layout.cells[1].x);
    assert.equal(layout.cells[2].y, layout.cells[1].y + layout.cells[1].height + 10);
  });

  it("reserves caption height only when captions are on", () => {
    const withCaptions = layoutBoard(spec({ pins: [pin("a", 100, 100)], showCaptions: true }));
    const without = layoutBoard(spec({ pins: [pin("a", 100, 100)] }));

    assert.equal(withCaptions.cells[0].height - without.cells[0].height, CAPTION_HEIGHT);
    assert.equal(withCaptions.cells[0].imageHeight, without.cells[0].imageHeight);
  });

  it("handles an empty board without collapsing to NaN", () => {
    const layout = layoutBoard(spec({ pins: [] }));
    assert.equal(layout.cells.length, 0);
    assert.equal(layout.height, 40);
    assert.equal(Number.isFinite(layout.width), true);
  });

  it("clamps a column count below one", () => {
    const layout = layoutBoard(spec({ columns: 0, pins: [pin("a", 100, 100), pin("b", 100, 100)] }));
    assert.equal(layout.cells[0].x, layout.cells[1].x);
  });
});
