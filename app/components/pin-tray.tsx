"use client";

import type { Pin } from "@/lib/types";
import { previewSrc } from "./board-preview";

type Props = {
  pins: Pin[];
  selected: ReadonlySet<string>;
  onToggle: (pinId: string) => void;
  onMeasure: (pin: Pin, width: number, height: number) => void;
};

/** Every extracted pin, with the ones on the board highlighted. */
export function PinTray({ pins, selected, onToggle, onMeasure }: Props) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
      {pins.map((pin) => {
        const isSelected = selected.has(pin.id);
        return (
          <li key={pin.id}>
            <button
              type="button"
              onClick={() => onToggle(pin.id)}
              aria-pressed={isSelected}
              title={pin.title ?? pin.imageUrl}
              className={`block w-full overflow-hidden rounded-lg border-2 transition ${
                isSelected
                  ? "border-stone-800"
                  : "border-transparent opacity-40 hover:opacity-70"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see BoardPreview: images come from the guarded /api/image proxy. */}
              <img
                src={previewSrc(pin.imageUrl)}
                alt={pin.title ?? "Pinterest pin"}
                loading="lazy"
                onLoad={(event) =>
                  onMeasure(pin, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                }
                className="aspect-square w-full object-cover"
                style={{ backgroundColor: pin.dominantColor ?? "#e9e4dd" }}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
