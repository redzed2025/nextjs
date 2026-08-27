"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { BOARD_DEFAULTS } from "@/lib/board-defaults";
import { layoutBoard } from "@/lib/layout";
import type { BoardSpec, ExtractResult, Pin } from "@/lib/types";
import { BoardControls } from "./board-controls";
import { BoardPreview } from "./board-preview";
import { PinTray } from "./pin-tray";

type Settings = Omit<BoardSpec, "pins">;
type ExportFormat = "svg" | "figma";

const PLACEHOLDER = `https://www.pinterest.com/username/board-name/
https://www.pinterest.com/pin/1234567890/`;

/** Width the preview is scaled to fit inside. */
const PREVIEW_VIEWPORT = 720;

export function Converter() {
  const [urls, setUrls] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [settings, setSettings] = useState<Settings>({
    title: "Pinterest board",
    ...BOARD_DEFAULTS,
  });
  const [status, setStatus] = useState<"idle" | "extracting" | "exporting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Sizes measured in the browser, so the preview stops guessing aspect ratios.
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const [measureTick, setMeasureTick] = useState(0);

  const sizedPins = useMemo(() => {
    void measureTick; // Re-derive when a new intrinsic size lands.
    return pins.map((pin) => {
      const size = measured.current.get(pin.id);
      return size ? { ...pin, width: pin.width ?? size.width, height: pin.height ?? size.height } : pin;
    });
  }, [pins, measureTick]);

  const boardPins = useMemo(
    () => sizedPins.filter((pin) => selected.has(pin.id)),
    [sizedPins, selected],
  );

  const layout = useMemo(
    () => layoutBoard({ ...settings, pins: boardPins }),
    [settings, boardPins],
  );

  const scale = Math.min(1, PREVIEW_VIEWPORT / Math.max(1, layout.width));

  const onMeasure = useCallback((pin: Pin, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const existing = measured.current.get(pin.id);
    if (existing && existing.width === width && existing.height === height) return;
    measured.current.set(pin.id, { width, height });
    setMeasureTick((tick) => tick + 1);
  }, []);

  const toggle = useCallback((pinId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pinId)) next.delete(pinId);
      else next.add(pinId);
      return next;
    });
  }, []);

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    setStatus("extracting");
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const payload = (await response.json()) as ExtractResult & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? `Extraction failed (HTTP ${response.status}).`);
        return;
      }

      measured.current.clear();
      setPins(payload.pins);
      setSelected(new Set(payload.pins.map((pin) => pin.id)));
      setWarnings(payload.warnings ?? []);
      if (payload.boardTitle) {
        setSettings((current) => ({ ...current, title: payload.boardTitle! }));
      }
      if (payload.pins.length === 0) {
        setError("No images found. Try pasting individual pin URLs instead of a board URL.");
      }
    } catch {
      setError("Could not reach the extractor. Check your connection and try again.");
    } finally {
      setStatus("idle");
    }
  }

  async function exportBoard(format: ExportFormat) {
    if (boardPins.length === 0) {
      setError("Select at least one pin to export.");
      return;
    }
    setStatus("exporting");
    setError(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format, board: { ...settings, pins: boardPins } }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? `Export failed (HTTP ${response.status}).`);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        (format === "svg" ? "moodboard.svg" : "moodboard.figma.json");

      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      setError("The export request failed. Try again with fewer pins.");
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Pinterest → Figma
        </h1>
        <p className="max-w-2xl text-sm text-stone-600">
          Paste Pinterest board or pin URLs, arrange the moodboard, then export an SVG you can
          drag straight into Figma — or a document for the companion plugin that rebuilds it as
          editable layers.
        </p>
      </header>

      <form onSubmit={extract} className="flex flex-col gap-3">
        <label htmlFor="urls" className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Pinterest URLs
        </label>
        <textarea
          id="urls"
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={3}
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 font-mono text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || urls.trim().length === 0}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "extracting" ? "Fetching pins…" : "Fetch pins"}
          </button>
          {pins.length > 0 ? (
            <span className="text-sm text-stone-500">
              {boardPins.length} of {pins.length} pins on the board
            </span>
          ) : null}
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {pins.length > 0 ? (
        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-8">
            <BoardControls
              settings={settings}
              onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
              disabled={busy}
            />

            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Export
              </span>
              <button
                type="button"
                onClick={() => exportBoard("svg")}
                disabled={busy || boardPins.length === 0}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "exporting" ? "Building…" : "Download SVG"}
              </button>
              <button
                type="button"
                onClick={() => exportBoard("figma")}
                disabled={busy || boardPins.length === 0}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download plugin document
              </button>
              <p className="text-xs leading-relaxed text-stone-500">
                Drag the SVG onto a Figma canvas for a one-shot import. Use the plugin document
                with <code className="font-mono">figma-plugin/</code> in this repo to get named
                frames with real image fills.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Pins ({pins.length})
              </span>
              <PinTray
                pins={sizedPins}
                selected={selected}
                onToggle={toggle}
                onMeasure={onMeasure}
              />
            </div>
          </aside>

          <section className="flex flex-col gap-3 overflow-hidden">
            <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Preview — {layout.width} × {layout.height} px
            </span>
            {boardPins.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-500">
                Pick pins from the tray to build a board.
              </div>
            ) : (
              <div
                className="overflow-hidden rounded-xl border border-stone-200"
                style={{ width: layout.width * scale, height: layout.height * scale }}
              >
                <div
                  className="origin-top-left"
                  style={{ transform: `scale(${scale})`, width: layout.width }}
                >
                  <BoardPreview
                    spec={settings}
                    layout={layout}
                    onRemove={toggle}
                    onMeasure={onMeasure}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
