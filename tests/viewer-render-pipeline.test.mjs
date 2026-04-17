import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../viewer.js', import.meta.url), 'utf8');

test('applyRenderMode refreshes generator state through applyShLevel after modifier changes', () => {
  assert.match(source, /applyRenderMode\(updateChip = true\)[\s\S]*this\.applyShLevel\(true\);/);
});
