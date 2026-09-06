/**
 * Per-user colour themes. The actual palettes live in globals.css as
 * `html[data-theme="<id>"]` blocks (light + dark variants); this module is
 * just the registry the picker renders and the validator the action trusts.
 * `swatch` is only for the picker preview — never the source of truth.
 */
export type Theme = {
  id: string;
  label: string;
  /** [background, primary] — preview dots on the picker. */
  swatch: [string, string];
};

export const THEMES: Theme[] = [
  { id: "indigo", label: "Indigo", swatch: ["#f6f6f4", "#4f46e5"] },
  { id: "pink", label: "Pink", swatch: ["#fdf4f7", "#db2777"] },
  { id: "forest", label: "Forest", swatch: ["#f4f7f4", "#047857"] },
  { id: "ocean", label: "Ocean", swatch: ["#f2f7fa", "#0369a1"] },
  { id: "sunset", label: "Sunset", swatch: ["#fdf6f0", "#c2410c"] },
  { id: "mono", label: "Mono", swatch: ["#f5f5f5", "#262626"] },
];

export const DEFAULT_THEME_ID = "indigo";

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

/** Falls back to the default for a null/unknown stored value. */
export function resolveThemeId(stored: string | null | undefined): string {
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

/** `<meta name="theme-color">` for the installed PWA's status bar. */
export function themeColor(stored: string | null | undefined): string {
  const id = resolveThemeId(stored);
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).swatch[1];
}
