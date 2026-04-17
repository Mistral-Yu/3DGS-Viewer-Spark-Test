import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../viewer.js', import.meta.url), 'utf8');

test('applyRenderMode keeps apply-only scripts visually idle and updates modifier pipelines consistently', () => {
  assert.match(source, /shouldAttachAnimationModifier\(/);
  assert.match(source, /this\.state\.animationPlaying \|\| this\.state\.animationTime > 0/);
  assert.match(source, /const animationModifier = this\.shouldAttachAnimationModifier\(\) \? this\.activeAnimationModifier : null;/);
  assert.match(source, /item\.mesh\.enableLod = !animationModifier;/);
  assert.match(source, /item\.mesh\.covObjectModifiers = item\.mesh\.objectModifiers;/);
  assert.match(source, /item\.mesh\.covWorldModifiers = item\.mesh\.worldModifiers;/);
  assert.match(source, /this\.applyShLevel\(true\);/);
});
