import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANIMATION_PRESET_LIBRARY,
  DEFAULT_ANIMATION_SCRIPT_NAME,
  buildAnimationDownloadName,
  createDefaultAnimationPlaybackState,
  getAnimationPresetScriptText,
  parseAnimationScript,
  shouldRenderAnimationFrame,
} from '../viewer-animation.mjs';

test('default preset parses as diffusion animation script', () => {
  const parsed = parseAnimationScript(getAnimationPresetScriptText('diffusion'));

  assert.equal(parsed.name, DEFAULT_ANIMATION_SCRIPT_NAME);
  assert.equal(parsed.preset, 'diffusion');
  assert.equal(parsed.loop, true);
  assert.ok(parsed.duration > 0);
});

test('explosion preset is available as a built-in script', () => {
  assert.ok(ANIMATION_PRESET_LIBRARY.explosion);
  const parsed = parseAnimationScript(getAnimationPresetScriptText('explosion'));
  assert.equal(parsed.preset, 'explosion');
  assert.ok(parsed.params.strength > 0);
});

test('parseAnimationScript clamps numeric parameters and keeps origin vector', () => {
  const parsed = parseAnimationScript(JSON.stringify({
    name: 'Custom Burst',
    preset: 'explosion',
    loop: false,
    duration: 12,
    origin: [1, 2, 3],
    params: {
      distanceScale: -4,
      opacityPower: 9,
      scaleInfluence: 3,
      speed: 2.5,
      strength: 8,
      swirl: 4,
    },
  }));

  assert.deepEqual(parsed.origin, { x: 1, y: 2, z: 3 });
  assert.equal(parsed.loop, false);
  assert.equal(parsed.params.distanceScale, 0);
  assert.equal(parsed.params.opacityPower, 4);
  assert.equal(parsed.params.scaleInfluence, 3);
  assert.equal(parsed.params.speed, 2.5);
});

test('buildAnimationDownloadName normalizes the script name for saving', () => {
  assert.equal(buildAnimationDownloadName('Diffuse / Burst v1'), 'diffuse-burst-v1.json');
});

test('createDefaultAnimationPlaybackState keeps the default script loaded but unapplied', () => {
  const script = parseAnimationScript(getAnimationPresetScriptText('diffusion'));
  const state = createDefaultAnimationPlaybackState(script);

  assert.equal(state.animationLoop, true);
  assert.equal(state.animationPlaying, false);
  assert.equal(state.animationTime, 0);
  assert.equal(state.animationDuration, script.duration);
  assert.equal(state.animationApplied, false);
});

test('shouldRenderAnimationFrame requires an applied script that is actively playing', () => {
  assert.equal(shouldRenderAnimationFrame({ animationApplied: false, animationPlaying: true }), false);
  assert.equal(shouldRenderAnimationFrame({ animationApplied: true, animationPlaying: false }), false);
  assert.equal(shouldRenderAnimationFrame({ animationApplied: true, animationPlaying: true }), true);
});
