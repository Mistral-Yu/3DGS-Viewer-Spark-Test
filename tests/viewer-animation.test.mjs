import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANIMATION_PRESET_LIBRARY,
  DEFAULT_ANIMATION_SCRIPT_NAME,
  buildAnimationDownloadName,
  canPlayAnimation,
  createDefaultAnimationPlaybackState,
  getAnimationPresetScriptText,
  parseAnimationScript,
  shouldRenderAnimationFrame,
} from '../viewer-animation.mjs';

test('built-in presets include explosion and reveal scripts', () => {
  assert.deepEqual(Object.keys(ANIMATION_PRESET_LIBRARY), ['explosion', 'reveal']);

  const explosion = parseAnimationScript(getAnimationPresetScriptText('explosion'));
  const reveal = parseAnimationScript(getAnimationPresetScriptText('reveal'));

  assert.equal(explosion.name, DEFAULT_ANIMATION_SCRIPT_NAME);
  assert.equal(explosion.preset, 'explosion');
  assert.equal(explosion.originMode, 'centroid');
  assert.equal(reveal.preset, 'reveal');
  assert.equal(reveal.originMode, 'centroid');
  assert.equal(typeof reveal.createModifier, 'function');
});

test('legacy diffusion scripts are rejected instead of being silently remapped', () => {
  assert.throws(
    () => parseAnimationScript(JSON.stringify({ preset: 'diffusion', duration: 6, loop: true, params: {} })),
    /Unknown animation preset: diffusion/,
  );
});

test('parseAnimationScript clamps numeric parameters and keeps manual origin vectors', () => {
  const parsed = parseAnimationScript(`({
    name: 'Custom Burst',
    preset: 'explosion',
    loop: false,
    duration: 12,
    originMode: 'manual',
    origin: [1, 2, 3],
    params: {
      distanceScale: -4,
      opacityPower: 9,
      scaleInfluence: 3,
      speed: 2.5,
      strength: 8,
      swirl: 4,
    },
    createModifier: ({ handles }) => handles.speed,
  })`);

  assert.equal(parsed.originMode, 'manual');
  assert.deepEqual(parsed.origin, { x: 1, y: 2, z: 3 });
  assert.equal(parsed.loop, false);
  assert.equal(parsed.params.distanceScale, 0);
  assert.equal(parsed.params.opacityPower, 4);
  assert.equal(parsed.params.scaleInfluence, 3);
  assert.equal(parsed.params.speed, 2.5);
  assert.equal(typeof parsed.createModifier, 'function');
});

test('parseAnimationScript rejects scripts without movement code', () => {
  assert.throws(
    () => parseAnimationScript(`({
      name: 'Broken Script',
      preset: 'explosion',
      duration: 2,
      loop: true,
      params: { speed: 1 }
    })`),
    /createModifier/,
  );
});

test('buildAnimationDownloadName normalizes the script name for saving', () => {
  assert.equal(buildAnimationDownloadName('Diffuse / Burst v1'), 'diffuse-burst-v1.js');
});

test('createDefaultAnimationPlaybackState keeps animation off when no script is loaded', () => {
  const state = createDefaultAnimationPlaybackState(null);

  assert.equal(state.animationLoop, false);
  assert.equal(state.animationPlaying, false);
  assert.equal(state.animationTime, 0);
  assert.equal(state.animationDuration, 0);
  assert.equal(state.animationApplied, false);
});

test('shouldRenderAnimationFrame requires an applied script that is actively playing', () => {
  assert.equal(shouldRenderAnimationFrame({ animationApplied: false, animationPlaying: true }), false);
  assert.equal(shouldRenderAnimationFrame({ animationApplied: true, animationPlaying: false }), false);
  assert.equal(shouldRenderAnimationFrame({ animationApplied: true, animationPlaying: true }), true);
});

test('canPlayAnimation requires an already applied modifier and does not auto-apply loaded scripts', () => {
  assert.equal(canPlayAnimation({ animationApplied: false, hasModifier: false }), false);
  assert.equal(canPlayAnimation({ animationApplied: false, hasModifier: true }), false);
  assert.equal(canPlayAnimation({ animationApplied: true, hasModifier: false }), false);
  assert.equal(canPlayAnimation({ animationApplied: true, hasModifier: true }), true);
});
