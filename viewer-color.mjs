import { linearToSrgbChannel, srgbToLinearChannel } from "./viewer-lut.mjs";

export { linearToSrgbChannel, srgbToLinearChannel };

export const SPLAT_COLOR_SPACE = Object.freeze({ SRGB: "srgb", LINEAR: "linear-srgb" });

export function colorComponents(color) {
  return [
    color?.r ?? color?.x ?? color?.[0],
    color?.g ?? color?.y ?? color?.[1],
    color?.b ?? color?.z ?? color?.[2],
  ].map((value) => Number.isFinite(Number(value)) ? Number(value) : 0);
}

// PLY does not standardize a transfer function. Untagged external splats are
// treated as sRGB; retain support for this viewer's older linear exports.
export function detectSplatColorSpace(header = "", authoredPrimitive = false) {
  if (authoredPrimitive) return SPLAT_COLOR_SPACE.LINEAR;
  const tags = [...String(header).matchAll(
    /^comment\s+(?:color_space|gs360_export_color_space)\s+(\S+)\s*$/gmi,
  )].map((match) => match[1].toLowerCase());
  if (tags.some((tag) => ["linear-srgb", "linear_srgb", "linear_srgb_values_srgb_display"].includes(tag))) {
    return SPLAT_COLOR_SPACE.LINEAR;
  }
  return SPLAT_COLOR_SPACE.SRGB;
}

export function sourceColorToLinear(color, colorSpace = SPLAT_COLOR_SPACE.SRGB) {
  const rgb = colorComponents(color);
  return colorSpace === SPLAT_COLOR_SPACE.LINEAR ? rgb : rgb.map(srgbToLinearChannel);
}

export function linearColorToSource(color, colorSpace = SPLAT_COLOR_SPACE.SRGB) {
  const rgb = colorComponents(color);
  return colorSpace === SPLAT_COLOR_SPACE.LINEAR ? rgb : rgb.map(linearToSrgbChannel);
}

export function linearColorToSrgb(color) {
  return colorComponents(color).map(linearToSrgbChannel);
}
