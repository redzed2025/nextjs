"use client";

import { CAPTION_HEIGHT } from "@/lib/layout";
import type { BoardLayout, BoardSpec, Pin } from "@/lib/types";

type Props = {
  spec: Omit<BoardSpec, "pins">;
  layout: BoardLayout;
  onRemove: (pinId: string) => void;
  /** Reports the browser-measured intrinsic size so the layout can settle. */
  onMeasure: (pin: Pin, width: number, height: number) => void;
};

export function previewSrc(imageUrl: string): string {
  return `/api/image?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Renders the board at true export coordinates, so the preview and the exported
 * file are the same layout. The caller scales it down for display.
 */
export function BoardPreview({ spec, layout, onRemove, onMeasure }: Props) {
  return (
    <div
      className="relative"
      style={{ width: layout.width, height: layout.height, background: spec.background }}
    >
      {layout.cells.map((cell) => (
        <div
          key={cell.pin.id}
          className="group absolute"
          style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served through /api/image, which picks a preview-sized Pinterest variant and sends the browser user-agent the CDN expects. */}
          <img
            src={previewSrc(cell.pin.imageUrl)}
            alt={cell.pin.title ?? cell.pin.description ?? "Pinterest pin"}
            loading="lazy"
            width={cell.width}
            height={cell.imageHeight}
            onLoad={(event) =>
              onMeasure(cell.pin, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
            }
            className="block w-full object-cover"
            style={{
              height: cell.imageHeight,
              borderRadius: spec.cornerRadius,
              backgroundColor: cell.pin.dominantColor ?? "#e9e4dd",
            }}
          />

          <button
            type="button"
            onClick={() => onRemove(cell.pin.id)}
            aria-label={`Remove ${cell.pin.title ?? "pin"} from the board`}
            className="absolute right-2 top-2 hidden size-7 items-center justify-center rounded-full bg-stone-900/80 text-sm leading-none text-white group-hover:flex"
          >
            ×
          </button>

          {spec.showCaptions && cell.pin.title ? (
            <span
              className="block truncate pt-1.5 text-[12px] text-stone-500"
              style={{ height: CAPTION_HEIGHT }}
            >
              {cell.pin.title}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
