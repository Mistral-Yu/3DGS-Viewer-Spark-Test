import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyToneCurveToLinearRgb,
  buildToneCurveSvgPathData,
  buildToneCurveState,
  getSelectedToneCurvePoint,
  insertToneCurvePoint,
  isNeutralToneCurve,
  removeToneCurvePoint,
  sampleToneCurveChannel,
  setToneCurveActiveChannel,
  setToneCurveSelectedPoint,
  updateToneCurvePoint,
} from '../viewer-tone-curve.mjs';

test('buildToneCurveState creates identity point curves for master and rgb channels', () => {
  const state = buildToneCurveState();

  assert.equal(state.activeChannel, 'master');
  assert.deepEqual(state.curves.master, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(state.curves.red, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.equal(isNeutralToneCurve(state), true);
});

test('insertToneCurvePoint adds a midpoint on the selected channel and keeps it selected', () => {
  const inserted = insertToneCurvePoint(buildToneCurveState(), 'master', { x: 0.25 });

  assert.deepEqual(inserted.curves.master, [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 1, y: 1 },
  ]);
  assert.equal(inserted.selectedPointIndices.master, 1);
  assert.deepEqual(getSelectedToneCurvePoint(inserted, 'master'), { x: 0.25, y: 0.25 });
});

test('updateToneCurvePoint clamps edited points between neighbours while preserving fixed endpoints', () => {
  const base = insertToneCurvePoint(buildToneCurveState(), 'master', { x: 0.4, y: 0.4 });
  const updated = updateToneCurvePoint(base, 'master', 1, { x: 2, y: -1 });

  assert.deepEqual(updated.curves.master, [
    { x: 0, y: 0 },
    { x: 0.999, y: 0 },
    { x: 1, y: 1 },
  ]);
});

test('removeToneCurvePoint deletes only non-endpoint points and falls back to identity when cleared', () => {
  const base = insertToneCurvePoint(buildToneCurveState(), 'blue', { x: 0.7, y: 0.9 });
  const removed = removeToneCurvePoint(base, 'blue', 1);

  assert.deepEqual(removed.curves.blue, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(removeToneCurvePoint(removed, 'blue', 0), removed);
});

test('applyToneCurveToLinearRgb uses master plus per-channel point curves in linear sRGB', () => {
  let state = buildToneCurveState();
  state = insertToneCurvePoint(state, 'master', { x: 0.5, y: 0.25 });
  state = insertToneCurvePoint(state, 'green', { x: 0.25, y: 0.1 });
  state = insertToneCurvePoint(state, 'blue', { x: 0.75, y: 0.9 });

  const curved = applyToneCurveToLinearRgb([0.5, 0.5, 0.5], state);

  assert.deepEqual(curved.map((value) => Number(value.toFixed(6))), [0.25, 0.1, 0.3]);
});

test('channel selection helpers track the active curve editor state', () => {
  let state = buildToneCurveState();
  state = setToneCurveActiveChannel(state, 'red');
  state = insertToneCurvePoint(state, 'red', { x: 0.6, y: 0.5 });
  state = setToneCurveSelectedPoint(state, 'red', 1);

  assert.equal(state.activeChannel, 'red');
  assert.deepEqual(getSelectedToneCurvePoint(state), { x: 0.6, y: 0.5 });
});

test('sampleToneCurveChannel uses smooth monotone interpolation instead of straight segments through interior points', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.05 },
    { x: 0.7, y: 0.55 },
    { x: 1, y: 1 },
  ];

  assert.notEqual(Number(sampleToneCurveChannel(points, 0.5).toFixed(6)), 0.3);
});

test('buildToneCurveSvgPathData emits a cubic path that matches the evaluated curve endpoints', () => {
  const path = buildToneCurveSvgPathData([
    { x: 0, y: 0 },
    { x: 0.35, y: 0.1 },
    { x: 0.7, y: 0.9 },
    { x: 1, y: 1 },
  ]);

  assert.match(path, /^M 0\.000 100\.000 C /);
  assert.match(path, /100\.000 0\.000$/);
});
