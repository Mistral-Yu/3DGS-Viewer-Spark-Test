import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../viewer.js', import.meta.url), 'utf8');

test('applyRenderMode refreshes generator state through applyShLevel after modifier changes and disables LoD while animation modifiers are active', () => {
  assert.match(source, /applyRenderMode\(updateChip = true\)[\s\S]*item\.mesh\.enableLod = !this\.activeAnimationModifier;/);
  assert.match(source, /applyRenderMode\(updateChip = true\)[\s\S]*this\.applyShLevel\(true\);/);
});
