import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCubeLutToLinearRgb,
  COLOR_SPACE_OPTIONS,
  parseCubeLut,
  transformColorSpace,
} from '../viewer-lut.mjs';

test('parseCubeLut reads a 3D .cube LUT with title, size, domain, and entries', () => {
  const lut = parseCubeLut(`
TITLE "invert"
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
0.25 0.5 0.75
`);

  assert.equal(lut.title, 'invert');
  assert.equal(lut.size, 2);
  assert.deepEqual(lut.domainMin, [0, 0, 0]);
  assert.deepEqual(lut.domainMax, [1, 1, 1]);
  assert.equal(lut.data.length, 8);
  assert.deepEqual(lut.data[7], [0.25, 0.5, 0.75]);
});

test('applyCubeLutToLinearRgb samples a 3D LUT between configurable color spaces', () => {
  const lut = parseCubeLut(`
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`);

  const linear = applyCubeLutToLinearRgb([0.25, 0.5, 0.75], lut, {
    inputColorSpace: 'linear-srgb',
    outputColorSpace: 'linear-srgb',
  });

  assert.deepEqual(linear.map((value) => Number(value.toFixed(6))), [0.25, 0.5, 0.75]);
});

test('transformColorSpace supports linear sRGB, display sRGB, and gamma 2.2 conversions', () => {
  assert.ok(COLOR_SPACE_OPTIONS.some((option) => option.value === 'linear-srgb'));
  assert.ok(COLOR_SPACE_OPTIONS.some((option) => option.value === 'srgb'));
  assert.ok(COLOR_SPACE_OPTIONS.some((option) => option.value === 'gamma22'));

  const display = transformColorSpace([0.25, 0.5, 0.75], 'linear-srgb', 'srgb');
  const roundTrip = transformColorSpace(display, 'srgb', 'linear-srgb');

  assert.deepEqual(roundTrip.map((value) => Number(value.toFixed(6))), [0.25, 0.5, 0.75]);
});

test('applyCubeLutToLinearRgb converts workspace linear sRGB before and after LUT sampling', () => {
  const lut = parseCubeLut(`
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`);

  const result = applyCubeLutToLinearRgb([0.25, 0.25, 0.25], lut, {
    inputColorSpace: 'srgb',
    outputColorSpace: 'srgb',
  });

  assert.deepEqual(result.map((value) => Number(value.toFixed(6))), [0.25, 0.25, 0.25]);
});
