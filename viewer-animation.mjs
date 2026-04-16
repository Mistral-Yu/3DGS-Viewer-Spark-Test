export const DEFAULT_ANIMATION_SCRIPT_NAME = 'Origin Diffusion';

const PRESET_LIBRARY = {
  diffusion: {
    duration: 6,
    loop: true,
    origin: [0, 0, 0],
    params: {
      distanceScale: 1.4,
      opacityPower: 1.35,
      scaleInfluence: 1.2,
      speed: 1,
      strength: 1.8,
      swirl: 0.18,
    },
  },
  explosion: {
    duration: 3.2,
    loop: true,
    origin: [0, 0, 0],
    params: {
      distanceScale: 1.1,
      opacityPower: 0.9,
      scaleInfluence: 1.6,
      speed: 1.6,
      strength: 3.4,
      swirl: 1.25,
    },
  },
};

export const ANIMATION_PRESET_LIBRARY = PRESET_LIBRARY;

const PARAM_LIMITS = {
  distanceScale: { min: 0, max: 6, default: 1.2 },
  opacityPower: { min: 0.1, max: 4, default: 1.2 },
  scaleInfluence: { min: 0, max: 4, default: 1 },
  speed: { min: 0.05, max: 8, default: 1 },
  strength: { min: 0, max: 12, default: 1.5 },
  swirl: { min: 0, max: 6, default: 0 },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

const normalizeOrigin = (origin) => {
  const values = Array.isArray(origin) ? origin : [origin?.x, origin?.y, origin?.z];
  return {
    x: round(Number(values[0]) || 0),
    y: round(Number(values[1]) || 0),
    z: round(Number(values[2]) || 0),
  };
};

const normalizeParams = (params = {}, defaults = {}) => {
  const result = {};
  Object.entries(PARAM_LIMITS).forEach(([key, limits]) => {
    const fallback = defaults[key] ?? limits.default;
    const value = params[key] ?? fallback;
    result[key] = round(clamp(Number(value) || 0, limits.min, limits.max));
  });
  return result;
};

export function parseAnimationScript(text) {
  const source = JSON.parse(String(text));
  const preset = source.preset in PRESET_LIBRARY ? source.preset : 'diffusion';
  const presetDefaults = PRESET_LIBRARY[preset];
  return {
    duration: round(clamp(Number(source.duration) || presetDefaults.duration, 0.1, 120), 3),
    loop: source.loop !== false,
    name: String(source.name || (preset === 'diffusion' ? DEFAULT_ANIMATION_SCRIPT_NAME : 'Splat Explosion')).trim() || DEFAULT_ANIMATION_SCRIPT_NAME,
    origin: normalizeOrigin(source.origin ?? presetDefaults.origin),
    params: normalizeParams(source.params, presetDefaults.params),
    preset,
    version: 1,
  };
}

export function serializeAnimationScript(config) {
  const parsed = typeof config === 'string' ? parseAnimationScript(config) : parseAnimationScript(JSON.stringify(config));
  return JSON.stringify({
    version: parsed.version,
    name: parsed.name,
    preset: parsed.preset,
    duration: parsed.duration,
    loop: parsed.loop,
    origin: [parsed.origin.x, parsed.origin.y, parsed.origin.z],
    params: parsed.params,
  }, null, 2);
}

export function getAnimationPresetScriptText(name) {
  if (!(name in PRESET_LIBRARY)) {
    throw new Error(`Unknown animation preset: ${name}`);
  }
  return serializeAnimationScript({
    name: name === 'diffusion' ? DEFAULT_ANIMATION_SCRIPT_NAME : 'Splat Explosion',
    preset: name,
    ...PRESET_LIBRARY[name],
  });
}

export function buildAnimationDownloadName(name) {
  const normalized = String(name || 'animation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'animation';
  return `${normalized}.json`;
}

export function createDefaultAnimationPlaybackState(script) {
  return {
    animationApplied: false,
    animationDuration: Math.max(script?.duration || 0.1, 0.1),
    animationLoop: script?.loop !== false,
    animationPlaying: false,
    animationTime: 0,
  };
}

export function shouldRenderAnimationFrame({ animationApplied, animationPlaying }) {
  return Boolean(animationApplied && animationPlaying);
}
