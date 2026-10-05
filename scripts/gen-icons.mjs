// Renders every brand image from one source, scripts/brand/mark.svg:
// PWA icons, the iOS home-screen icon, the favicon, the long-press shortcut
// icons and the iOS launch screens (light + dark, one per iPhone size).
// Output is committed — nothing runs this at build time.
//
// Usage: node scripts/gen-icons.mjs
//
// `sharp` is not a direct dependency: it ships with Next (image
// optimisation), which is enough for a script a person runs by hand.
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const ICONS = join(PUBLIC, "icons");
const SPLASH = join(PUBLIC, "splash");
mkdirSync(ICONS, { recursive: true });
mkdirSync(SPLASH, { recursive: true });

const MARK = readFileSync(join(ROOT, "scripts/brand/mark.svg"), "utf8");
// The <defs> and background of mark.svg, reused under other glyphs.
const BG = MARK.slice(MARK.indexOf("<defs>"), MARK.indexOf('<g id="mark">'));

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** The square icon with an iOS-like corner radius baked in (for places the
 *  OS does not mask: favicon, the in-app logo, launch screens). */
const rounded = MARK.replace(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#r)">',
).replace("</svg>", "</g></svg>");

async function write(path, buf) {
  writeFileSync(path, buf);
  console.log("wrote", path.slice(ROOT.length + 1));
}

// --- PWA + iOS icons. Full-bleed squares: iOS and Android cut the corners
// themselves. The mark sits inside the 80% maskable safe zone (its outermost
// point is 350/512 from the centre), so one image serves both purposes.
await write(join(ICONS, "icon-192.png"), await png(MARK, 192));
await write(join(ICONS, "icon-512.png"), await png(MARK, 512));
await write(join(ICONS, "icon-maskable-512.png"), await png(MARK, 512));
await write(join(PUBLIC, "apple-touch-icon.png"), await png(MARK, 180));
// src/app/apple-icon.png is what Next links in <head> (file convention, like
// icon.svg). The public/ copy is the path iOS tries when no link is found.
await write(join(ROOT, "src/app/apple-icon.png"), await png(MARK, 180));
writeFileSync(join(ROOT, "src/app/icon.svg"), rounded);
console.log("wrote src/app/icon.svg");

// Android notification badge: drawn as a white silhouette from the alpha
// channel only, so it must be the mark alone on transparency — a full-colour
// square shows up as a plain white square in the status bar.
{
  const mark = MARK.slice(MARK.indexOf('<g id="mark">'), MARK.indexOf("</svg>"))
    .replace(/fill="#[0-9a-f]{6}"/g, 'fill="#ffffff"')
    .replace('stroke-opacity="0.5"', "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="112 112 800 800">${mark}</svg>`;
  await write(join(ICONS, "badge-96.png"), await png(svg, 96));
}

// favicon.ico with PNG payloads (valid since Vista; every browser reads it).
{
  const sizes = [16, 32, 48];
  const imgs = await Promise.all(sizes.map((s) => png(rounded, s)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header[e] = s;
    header[e + 1] = s;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(imgs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  await write(join(ROOT, "src/app/favicon.ico"), Buffer.concat([header, ...imgs]));
}

// --- Long-press shortcuts (Android, desktop). Lucide glyphs (ISC) on the
// brand background, so each shortcut is recognisable at a glance.
const GLYPHS = {
  add: '<path d="M5 12h14M12 5v14"/>',
  speak: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  snap: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
};
for (const [name, glyph] of Object.entries(GLYPHS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${BG}<g transform="translate(256 256) scale(21.333)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
  await write(join(ICONS, `shortcut-${name}.png`), await png(svg, 192));
}

// --- iOS launch screens. iOS ignores the manifest's splash fields and shows
// a blank white screen unless it finds an apple-touch-startup-image whose
// media query matches the device exactly. [css width, css height, ratio].
// Keep in sync with src/lib/splash.ts, which emits the matching <link> tags.
const SPLASH_SIZES = [
  [440, 956, 3], // 16/17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [420, 912, 3], // iPhone Air
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6/7/8 Plus
  [402, 874, 3], // 16/17 Pro
  [393, 852, 3], // 14 Pro, 15, 16, 15 Pro
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [375, 667, 2], // 6/7/8, SE 2/3
];
const SURFACES = { light: "#f6f6f4", dark: "#131313" };
for (const [w, h, r] of SPLASH_SIZES) {
  const W = w * r;
  const H = h * r;
  const icon = Math.round(112 * r);
  const tile = await png(rounded, icon);
  for (const [scheme, bg] of Object.entries(SURFACES)) {
    const buf = await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
      .composite([{ input: tile, left: Math.round((W - icon) / 2), top: Math.round((H - icon) / 2 - H * 0.04) }])
      // Palette PNG: a flat ground and one small tile quantise without visible
      // loss, at about a fifth of the size.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
    await write(join(SPLASH, `${scheme}-${W}x${H}.png`), buf);
  }
}
