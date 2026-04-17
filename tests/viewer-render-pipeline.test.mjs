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

test('tone curve state is stored per scene item and applied only to the selected item', () => {
  assert.match(source, /settings:\s*\{[\s\S]*toneCurve:\s*buildToneCurveState\(\)/);
  assert.match(source, /this\.state\.toneCurve = normalizeToneCurveState\(item\?\.settings\?\.toneCurve \?\? buildToneCurveState\(\)\);/);
  assert.match(source, /item\.settings\.toneCurve = normalizeToneCurveState\(this\.state\.toneCurve\);/);
  assert.match(source, /if \(item\.id === this\.selectedSceneItemId && !isNeutralToneCurve\(item\.settings\.toneCurve\)\)/);
  assert.match(source, /createToneCurveColorModifier\(item\.settings\.toneCurve\)/);
  assert.match(source, /const toneCurve = item\.settings\?\.toneCurve \?\? buildToneCurveState\(\);/);
  assert.doesNotMatch(source, /createToneCurveColorModifier\(this\.state\.toneCurve\)/);
});

test('exposure and tone-curve edits use deferred low-fps preview while inputs are active', () => {
  assert.match(source, /setExposure\(value, \{ commit = true, syncInput = true \} = \{\}\) \{[\s\S]*if \(commit\) \{[\s\S]*this\.finishDeferredInteraction\(\);[\s\S]*\} else \{[\s\S]*this\.startDeferredInteraction\(\);/);
  assert.match(source, /setSelectedExposure\(value, \{ commit = true, syncInput = true \} = \{\}\) \{[\s\S]*if \(commit\) \{[\s\S]*this\.finishDeferredInteraction\(\);[\s\S]*\} else \{[\s\S]*this\.startDeferredInteraction\(\);/);
  assert.match(source, /setSelectedToneCurvePointValue\(axis, value, \{ commit = true \} = \{\}\) \{/);
  assert.match(source, /range\?\.addEventListener\("input", \(event\) => onChange\(event\.target\.value, \{[\s\S]*commit:\s*false/);
  assert.match(source, /range\?\.addEventListener\("change", \(event\) => onChange\(event\.target\.value, \{[\s\S]*commit:\s*true/);
});

test('info panel metadata includes auto-lod and load-mode summaries', () => {
  assert.match(source, /infoAutoLod: document\.getElementById\("info-auto-lod"\)/);
  assert.match(source, /infoLoadMode: document\.getElementById\("info-load-mode"\)/);
  assert.match(source, /this\.dom\.infoAutoLod\.textContent = this\.state\.autoLodEnabled \? "Enabled" : "Disabled";/);
  assert.match(source, /this\.dom\.infoLoadMode\.textContent = buildLodInfoLabel\(\{/);
});
