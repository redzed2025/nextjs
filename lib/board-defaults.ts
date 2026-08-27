/**
 * Board defaults and bounds, kept free of Node imports so both the client UI
 * and the server-side validator can use the same numbers.
 */
export const BOARD_DEFAULTS = {
  columns: 4,
  columnWidth: 320,
  gap: 16,
  padding: 48,
  background: "#faf7f2",
  cornerRadius: 12,
  showCaptions: false,
} as const;

export const LIMITS = {
  columns: [1, 12],
  columnWidth: [80, 1200],
  gap: [0, 200],
  padding: [0, 400],
  cornerRadius: [0, 200],
  pins: [1, 200],
} as const;
