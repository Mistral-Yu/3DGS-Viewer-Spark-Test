const clamp01 = (value) => Math.min(Math.max(Number.isFinite(Number(value)) ? Number(value) : 0, 0), 1);

export const COLOR_SPACE_OPTIONS = [
  { value: 'linear-srgb', label: 'Linear sRGB' },
  { value: 'srgb', label: 'Display sRGB' },
  { value: 'gamma22', label: 'Gamma 2.2' },
];

const COLOR_SPACE_VALUES = new Set(COLOR_SPACE_OPTIONS.map((option) => option.value));

const sanitizeColorSpace = (space) => (COLOR_SPACE_VALUES.has(space) ? space : 'linear-srgb');

export function linearToSrgbChannel(value) {
  const x = clamp01(value);
  return x <= 0.0031308 ? x * 12.92 : (1.055 * (x ** (1 / 2.4))) - 0.055;
}

export function srgbToLinearChannel(value) {
  const x = clamp01(value);
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function toLinearColor(rgb, space) {
  const safeSpace = sanitizeColorSpace(space);
  const color = rgb.map(clamp01);
  if (safeSpace === 'srgb') {
    return color.map(srgbToLinearChannel);
  }
  if (safeSpace === 'gamma22') {
    return color.map((value) => clamp01(value) ** 2.2);
  }
  return color;
}

function fromLinearColor(rgb, space) {
  const safeSpace = sanitizeColorSpace(space);
  const color = rgb.map(clamp01);
  if (safeSpace === 'srgb') {
    return color.map(linearToSrgbChannel);
  }
  if (safeSpace === 'gamma22') {
    return color.map((value) => clamp01(value) ** (1 / 2.2));
  }
  return color;
}

export function transformColorSpace(rgb, fromSpace, toSpace) {
  return fromLinearColor(toLinearColor(rgb, fromSpace), toSpace);
}

const parseTriple = (tokens, lineLabel) => {
  const values = tokens.slice(0, 3).map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid ${lineLabel} in .cube LUT`);
  }
  return values;
};

export function parseCubeLut(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const data = [];
  let title = '';
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) {
      return;
    }
    const titleMatch = line.match(/^TITLE\s+"?([^"\n]+)"?$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      return;
    }
    const tokens = line.split(/\s+/);
    const keyword = tokens[0].toUpperCase();
    if (keyword === 'LUT_3D_SIZE') {
      size = Number(tokens[1]);
      if (!Number.isInteger(size) || size < 2) {
        throw new Error('Invalid LUT_3D_SIZE in .cube LUT');
      }
      return;
    }
    if (keyword === 'DOMAIN_MIN') {
      domainMin = parseTriple(tokens.slice(1), 'DOMAIN_MIN');
      return;
    }
    if (keyword === 'DOMAIN_MAX') {
      domainMax = parseTriple(tokens.slice(1), 'DOMAIN_MAX');
      return;
    }
    if (keyword === 'LUT_1D_SIZE' || keyword === 'LUT_1D_INPUT_RANGE') {
      throw new Error('Only 3D .cube LUT files are supported');
    }
    data.push(parseTriple(tokens, 'RGB entry'));
  });

  if (!size) {
    throw new Error('Missing LUT_3D_SIZE in .cube LUT');
  }
  const expected = size ** 3;
  if (data.length !== expected) {
    throw new Error(`Expected ${expected} LUT entries, found ${data.length}`);
  }
  return { title, size, domainMin, domainMax, data };
}

const lerp = (a, b, t) => a + ((b - a) * t);

function sampleCubeLut(lut, rgb) {
  const { size, data, domainMin, domainMax } = lut;
  const coordinates = rgb.map((value, channel) => {
    const min = domainMin[channel];
    const max = domainMax[channel];
    const normalized = Math.abs(max - min) < 1e-8 ? 0 : (value - min) / (max - min);
    const scaled = clamp01(normalized) * (size - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(lo + 1, size - 1);
    return { lo, hi, t: scaled - lo };
  });
  const at = (r, g, b) => data[r + (g * size) + (b * size * size)] ?? [0, 0, 0];
  const [r, g, b] = coordinates;
  const c000 = at(r.lo, g.lo, b.lo);
  const c100 = at(r.hi, g.lo, b.lo);
  const c010 = at(r.lo, g.hi, b.lo);
  const c110 = at(r.hi, g.hi, b.lo);
  const c001 = at(r.lo, g.lo, b.hi);
  const c101 = at(r.hi, g.lo, b.hi);
  const c011 = at(r.lo, g.hi, b.hi);
  const c111 = at(r.hi, g.hi, b.hi);
  return [0, 1, 2].map((channel) => {
    const x00 = lerp(c000[channel], c100[channel], r.t);
    const x10 = lerp(c010[channel], c110[channel], r.t);
    const x01 = lerp(c001[channel], c101[channel], r.t);
    const x11 = lerp(c011[channel], c111[channel], r.t);
    const y0 = lerp(x00, x10, g.t);
    const y1 = lerp(x01, x11, g.t);
    return clamp01(lerp(y0, y1, b.t));
  });
}

export function applyCubeLutToLinearRgb(linearRgb, lut, options = {}) {
  const inputColorSpace = sanitizeColorSpace(options.inputColorSpace);
  const outputColorSpace = sanitizeColorSpace(options.outputColorSpace);
  const lutInput = transformColorSpace(linearRgb, 'linear-srgb', inputColorSpace);
  const lutOutput = sampleCubeLut(lut, lutInput);
  return transformColorSpace(lutOutput, outputColorSpace, 'linear-srgb');
}

export function summarizeCubeLut(lut) {
  const title = lut?.title ? `${lut.title} ` : '';
  return `${title}${lut?.size ?? '?'}³ .cube`;
}
