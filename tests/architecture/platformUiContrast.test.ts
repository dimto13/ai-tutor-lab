import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../../apps/web/src/styles.css", import.meta.url);

type Oklch = readonly [lightness: number, chroma: number, hue: number];
type Rgb = readonly [red: number, green: number, blue: number];

function readOklch(source: string, token: string): Oklch {
  const match = source.match(
    new RegExp(`--${token}:\\s*oklch\\(([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\)`),
  );
  assert.ok(match, `Missing opaque oklch token --${token}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function oklchToSrgb([lightness, chroma, hue]: Oklch): Rgb {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((channel) => {
    const clamped = Math.max(0, channel);
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, encoded));
  }) as unknown as Rgb;
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Oklch, second: Oklch): number {
  const firstLuminance = relativeLuminance(oklchToSrgb(first));
  const secondLuminance = relativeLuminance(oklchToSrgb(second));
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function hueDistance(first: number, second: number): number {
  const direct = Math.abs(first - second) % 360;
  return Math.min(direct, 360 - direct);
}

test("platform palette meets contrast and separation gates", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const platformBackground = readOklch(styles, "platform-background");
  const platformSurface = readOklch(styles, "platform-surface");
  const platformRaised = readOklch(styles, "platform-surface-raised");
  const platformForeground = readOklch(styles, "platform-foreground");
  const platformMuted = readOklch(styles, "platform-muted-foreground");
  const platformBorder = readOklch(styles, "platform-border");
  const platformAccent = readOklch(styles, "platform-accent");
  const platformAccentForeground = readOklch(styles, "platform-accent-foreground");
  const platformRing = readOklch(styles, "platform-ring");
  const toolAccent = readOklch(styles, "accent");

  assert.ok(contrastRatio(platformAccent, platformAccentForeground) >= 4.5);
  assert.ok(contrastRatio(platformForeground, platformSurface) >= 4.5);
  assert.ok(contrastRatio(platformForeground, platformRaised) >= 4.5);
  assert.ok(contrastRatio(platformMuted, platformSurface) >= 4.5);
  assert.ok(contrastRatio(platformMuted, platformRaised) >= 4.5);
  assert.ok(contrastRatio(platformBorder, platformRaised) >= 3);
  assert.ok(contrastRatio(platformRing, platformRaised) >= 3);
  assert.ok(contrastRatio(platformForeground, platformBackground) >= 4.5);

  assert.ok(
    hueDistance(platformAccent[2], toolAccent[2]) >= 45,
    "Platform accent must stay visibly separated from the default simulator accent",
  );
});
