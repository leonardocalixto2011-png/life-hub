/**
 * iOS launch screens. iOS ignores the manifest's splash fields and shows a
 * blank white screen on launch unless an apple-touch-startup-image's media
 * query matches the device exactly, so there is one image per iPhone size,
 * in a light and a dark version. Rendered by scripts/gen-icons.mjs — keep
 * the two lists in sync. [css width, css height, device pixel ratio].
 */
const SIZES: [number, number, number][] = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [420, 912, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [375, 667, 2],
];

export const startupImages = SIZES.flatMap(([w, h, r]) =>
  (["light", "dark"] as const).map((scheme) => ({
    url: `/splash/${scheme}-${w * r}x${h * r}.png`,
    media:
      `(device-width: ${w}px) and (device-height: ${h}px) and ` +
      `(-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and ` +
      `(prefers-color-scheme: ${scheme})`,
  })),
);
