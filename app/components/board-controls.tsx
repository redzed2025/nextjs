"use client";

import { LIMITS } from "@/lib/board-defaults";
import type { BoardSpec } from "@/lib/types";

type Settings = Omit<BoardSpec, "pins">;

type Props = {
  settings: Settings;
  onChange: (next: Partial<Settings>) => void;
  disabled: boolean;
};

const SLIDERS = [
  { key: "columns", label: "Columns", unit: "", step: 1 },
  { key: "columnWidth", label: "Column width", unit: "px", step: 10 },
  { key: "gap", label: "Gap", unit: "px", step: 2 },
  { key: "padding", label: "Padding", unit: "px", step: 4 },
  { key: "cornerRadius", label: "Corner radius", unit: "px", step: 1 },
] as const satisfies readonly {
  key: keyof typeof LIMITS & keyof Settings;
  label: string;
  unit: string;
  step: number;
}[];

export function BoardControls({ settings, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Board name
        </span>
        <input
          type="text"
          value={settings.title}
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.target.value })}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 disabled:opacity-50"
        />
      </label>

      {SLIDERS.map((slider) => {
        const [min, max] = LIMITS[slider.key];
        const value = settings[slider.key];
        return (
          <label key={slider.key} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-stone-500">
              {slider.label}
              <span className="font-mono text-[11px] normal-case tracking-normal text-stone-700">
                {value}
                {slider.unit}
              </span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={slider.step}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange({ [slider.key]: Number(event.target.value) })}
              className="accent-stone-800 disabled:opacity-50"
            />
          </label>
        );
      })}

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Background
        </span>
        <input
          type="color"
          value={settings.background}
          disabled={disabled}
          onChange={(event) => onChange({ background: event.target.value })}
          className="h-8 w-14 cursor-pointer rounded border border-stone-300 bg-white disabled:opacity-50"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={settings.showCaptions}
          disabled={disabled}
          onChange={(event) => onChange({ showCaptions: event.target.checked })}
          className="size-4 accent-stone-800"
        />
        Include pin titles as captions
      </label>
    </div>
  );
}
