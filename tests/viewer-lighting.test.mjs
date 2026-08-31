import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyDirectLighting,
  applyOneBouncePreview,
  computeSampledGaussianProxyRadius,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_LIGHT_HELPER_SCALE,
  DIRECT_LIGHT_DISTANCE_SQ_EPSILON,
  DIRECT_LIGHT_NORMAL_POLICY,
  clampLightColor,
  createDefaultLightState,
  evaluateGaussianSegmentCoverage,
  evaluateDirectPointLight,
  evaluateOneBounceVplIrradiance,
  evaluateSampledLightTransmission,
  ONE_BOUNCE_VPL_GAIN,
  selectOneBounceVpls,
} from '../viewer-lighting.mjs';

test('createDefaultLightState uses the requested helper-size default', () => {
  const light = createDefaultLightState({ sceneLightSerial: 1, radius: 1 });

  assert.equal(light.helperScale, DEFAULT_LIGHT_HELPER_SCALE);
  assert.equal(light.intensity, 12);
  assert.deepEqual(light.color, DEFAULT_LIGHT_COLOR);
});

test('createDefaultLightState scales intensity from scene radius', () => {
  const light = createDefaultLightState({ sceneLightSerial: 3, radius: 4 });

  assert.equal(light.name, 'Point Light 3');
  assert.equal(light.intensity, 64);
});

test('clampLightColor keeps linear sRGB channel values in the 0..1 range', () => {
  assert.deepEqual(
    clampLightColor({ r: 1.5, g: -0.25, b: 0.4 }),
    { r: 1, g: 0, b: 0.4 },
  );
});

test('direct point light follows inverse-square falloff', () => {
  const near = evaluateDirectPointLight({
    intensity: 4,
    lightColor: [1, 1, 1],
    lightPosition: [2, 0, 0],
    normal: [1, 0, 0],
    position: [0, 0, 0],
  });
  const far = evaluateDirectPointLight({
    intensity: 4,
    lightColor: [1, 1, 1],
    lightPosition: [4, 0, 0],
    normal: [1, 0, 0],
    position: [0, 0, 0],
  });

  assert.deepEqual(near, [1, 1, 1]);
  assert.deepEqual(far, [0.25, 0.25, 0.25]);
});

test('one-sided authored normals reject a Macbeth back-light', () => {
  assert.deepEqual(
    evaluateDirectPointLight({
      intensity: 12,
      lightColor: [1, 1, 1],
      lightPosition: [0, 0, -1],
      normal: [0, 0, 1],
      position: [0, 0, 0],
    }),
    [0, 0, 0],
  );
});

test('direct lighting is per-channel linear RGB and preserves the baked base term', () => {
  assert.deepEqual(
    applyDirectLighting({
      baseLinearRgb: [0.2, 0.3, 0.4],
      lights: [{
        color: [0, 1, 0.5],
        intensity: 4,
        position: [2, 0, 0],
        visible: true,
      }],
      normal: [1, 0, 0],
      position: [0, 0, 0],
    }),
    [0.2, 0.6, 0.6000000000000001],
  );
});

test('direct lighting honors visibility', () => {
  const options = {
    baseLinearRgb: [0.2, 0.2, 0.2],
    lights: [{
      color: [1, 1, 1],
      intensity: 4,
      position: [2, 0, 0],
      visibility: 0.5,
    }],
    normal: [1, 0, 0],
    position: [0, 0, 0],
  };

  assert.deepEqual(applyDirectLighting(options), [0.30000000000000004, 0.30000000000000004, 0.30000000000000004]);
});

test('imported covariance normals face forward to remain relightable but reject a back-light', () => {
  const options = {
    baseLinearRgb: [0.2, 0.2, 0.2],
    cameraPosition: [4, 0, 0],
    normal: [-1, 0, 0],
    normalPolicy: DIRECT_LIGHT_NORMAL_POLICY.IMPORTED_COVARIANCE_FACE_FORWARD,
    position: [0, 0, 0],
  };

  assert.deepEqual(
    applyDirectLighting({
      ...options,
      lights: [{ color: [1, 1, 1], intensity: 4, position: [2, 0, 0] }],
    }),
    [0.4, 0.4, 0.4],
  );
  assert.deepEqual(
    applyDirectLighting({
      ...options,
      lights: [{ color: [1, 1, 1], intensity: 4, position: [-2, 0, 0] }],
    }),
    [0.2, 0.2, 0.2],
  );
});

test('sampled Gaussian transmission stays clear for an off-ray occluder', () => {
  const transmission = evaluateSampledLightTransmission({
    lightPosition: [0, 0, 0],
    occluders: [{ opacity: 1, position: [5, 3, 0], radius: 1 }],
    receiverPosition: [10, 0, 0],
  });

  assert.equal(transmission, 1);
});

test('sampled Gaussian transmission blocks opaque on-ray samples and accumulates alpha softly', () => {
  const lightPosition = [0, 0, 0];
  const receiverPosition = [10, 0, 0];
  const opaque = { opacity: 1, position: [5, 0, 0], radius: 1 };
  const partial = { opacity: 0.5, position: [5, 0, 0], radius: 1 };

  assert.equal(evaluateSampledLightTransmission({ lightPosition, occluders: [opaque], receiverPosition }), 0);
  assert.equal(evaluateSampledLightTransmission({ lightPosition, occluders: [partial], receiverPosition }), 0.5);
});

test('receiver endpoint bias ignores adjacent receiver splats while retaining mid-segment self-shadow', () => {
  const lightPosition = [0, 0, 0];
  const receiverPosition = [10, 0, 0];

  assert.equal(
    evaluateGaussianSegmentCoverage({
      lightPosition,
      occluderPosition: receiverPosition,
      opacity: 1,
      radius: 1,
      receiverPosition,
    }),
    0,
  );
  assert.ok(
    evaluateGaussianSegmentCoverage({
      lightPosition,
      occluderPosition: [5, 0, 0],
      opacity: 1,
      radius: 1,
      receiverPosition,
    }) > 0,
  );
});

test('samples beyond either endpoint do not shadow the segment', () => {
  const options = {
    lightPosition: [0, 0, 0],
    opacity: 1,
    radius: 1,
    receiverPosition: [10, 0, 0],
  };

  assert.equal(evaluateGaussianSegmentCoverage({ ...options, occluderPosition: [-1, 0, 0] }), 0);
  assert.equal(evaluateGaussianSegmentCoverage({ ...options, occluderPosition: [11, 0, 0] }), 0);
});

test('a decimated Gaussian proxy still blocks its represented ray footprint', () => {
  const proxyRadius = computeSampledGaussianProxyRadius({
    selectedSampleCount: 16,
    sourceSampleCount: 1944,
    worldRadius: 0.0275,
  });
  const transmission = evaluateSampledLightTransmission({
    lightPosition: [0, 0, 0],
    occluders: [{ opacity: 0.9, position: [5, 0.04695, 0], radius: proxyRadius }],
    receiverPosition: [10, 0, 0],
  });

  assert.ok(proxyRadius > 0.04695);
  assert.ok(transmission <= 0.3);
});

test('zero-opacity samples have no sampled shadow coverage', () => {
  assert.equal(
    evaluateSampledLightTransmission({
      lightPosition: [0, 0, 0],
      occluders: [{ opacity: 0, position: [5, 0, 0], radius: 1 }],
      receiverPosition: [10, 0, 0],
    }),
    1,
  );
});

test('sampled opacity accumulation is finite, bounded, and monotonic under sample order', () => {
  const options = {
    lightPosition: [0, 0, 0],
    receiverPosition: [10, 0, 0],
  };
  const first = { opacity: 0.25, position: [4, 0, 0], radius: 1 };
  const second = { opacity: 0.5, position: [6, 0, 0], radius: 1 };
  const oneSample = evaluateSampledLightTransmission({ ...options, occluders: [first] });
  const twoSamples = evaluateSampledLightTransmission({ ...options, occluders: [first, second] });
  const reversed = evaluateSampledLightTransmission({ ...options, occluders: [second, first] });

  assert.ok(twoSamples <= oneSample);
  assert.ok(twoSamples >= 0 && twoSamples <= 1 && Number.isFinite(twoSamples));
  assert.equal(twoSamples, reversed);
});

test('each direct light honors its own visibility without changing the base radiance', () => {
  assert.deepEqual(
    applyDirectLighting({
      baseLinearRgb: [0.2, 0.2, 0.2],
      lights: [
        { color: [1, 1, 1], intensity: 4, position: [2, 0, 0], visibility: 0, visible: true },
        { color: [1, 1, 1], intensity: 4, position: [2, 0, 0], visibility: 0, visible: true },
      ],
      normal: [1, 0, 0],
      position: [0, 0, 0],
    }),
    [0.2, 0.2, 0.2],
  );
});

const oneBounceLight = {
  color: [1, 1, 1],
  intensity: 4,
  position: [4, 0, 0],
  visible: true,
};

const redAuthoredBounceSource = (stableId = 'red-source:0', ordinal = 0) => ({
  baseLinearRgb: [1, 0, 0],
  hasAuthoredNormal: true,
  normal: [1, 0, 0],
  opacity: 1,
  ordinal,
  position: [2, 0, 0],
  stableId,
  surfaceRadius: 0.1,
  visibility: 1,
});

test('one-bounce VPLs transfer authored source color in linear RGB', () => {
  const vpls = selectOneBounceVpls({
    candidates: [redAuthoredBounceSource()],
    enabled: true,
    light: oneBounceLight,
  });
  const irradiance = evaluateOneBounceVplIrradiance({
    enabled: true,
    normal: [-1, 0, 0],
    position: [3, 0, 0],
    vpls,
  });

  assert.equal(vpls.length, 1);
  assert.ok(irradiance[0] > 0);
  assert.equal(irradiance[1], 0);
  assert.equal(irradiance[2], 0);
});

test('a sampled-shadow-blocked VPL source produces no flux', () => {
  const vpls = selectOneBounceVpls({
    candidates: [{ ...redAuthoredBounceSource(), visibility: 0 }],
    enabled: true,
    light: oneBounceLight,
  });

  assert.deepEqual(vpls, []);
  assert.deepEqual(
    applyOneBouncePreview({
      baseLinearRgb: [0.2, 0.3, 0.4],
      enabled: true,
      normal: [-1, 0, 0],
      position: [3, 0, 0],
      vpls,
    }),
    [0.2, 0.3, 0.4],
  );
});

test('imported covariance candidates never become one-bounce emitters', () => {
  const vpls = selectOneBounceVpls({
    candidates: [{ ...redAuthoredBounceSource(), hasAuthoredNormal: false }],
    enabled: true,
    light: oneBounceLight,
  });

  assert.deepEqual(vpls, []);
  assert.deepEqual(
    applyOneBouncePreview({
      baseLinearRgb: [0.2, 0.3, 0.4],
      enabled: true,
      normal: [-1, 0, 0],
      position: [3, 0, 0],
      vpls,
    }),
    [0.2, 0.3, 0.4],
  );
});

test('one-bounce VPLs require both emitter and receiver facing', () => {
  const vpls = [{
    flux: [1, 1, 1],
    normal: [1, 0, 0],
    position: [2, 0, 0],
    radius: 0.1,
  }];
  const receiver = { enabled: true, normal: [-1, 0, 0], position: [3, 0, 0], vpls };

  assert.ok(evaluateOneBounceVplIrradiance(receiver).every((value) => value > 0));
  assert.deepEqual(
    evaluateOneBounceVplIrradiance({ ...receiver, vpls: [{ ...vpls[0], normal: [-1, 0, 0] }] }),
    [0, 0, 0],
  );
  assert.deepEqual(
    evaluateOneBounceVplIrradiance({ ...receiver, normal: [1, 0, 0] }),
    [0, 0, 0],
  );
});

test('one-bounce preview is exactly the base color while disabled', () => {
  const baseLinearRgb = [0.2, 0.3, 0.4];

  assert.deepEqual(
    applyOneBouncePreview({
      baseLinearRgb,
      enabled: false,
      normal: [-1, 0, 0],
      position: [3, 0, 0],
      vpls: [{ flux: [1, 1, 1], normal: [1, 0, 0], position: [2, 0, 0], radius: 0.1 }],
    }),
    baseLinearRgb,
  );
});

test('one-bounce VPL selection is stable and surface-density normalized', () => {
  const candidates = [
    redAuthoredBounceSource('source-c:0', 0),
    redAuthoredBounceSource('source-a:2', 2),
    redAuthoredBounceSource('source-b:1', 1),
  ];
  const selected = selectOneBounceVpls({ candidates, enabled: true, light: oneBounceLight, limit: 2 });
  const single = selectOneBounceVpls({
    candidates: [redAuthoredBounceSource()],
    enabled: true,
    light: oneBounceLight,
  });
  const dense = selectOneBounceVpls({ candidates, enabled: true, light: oneBounceLight });
  const totalFlux = (vpls) => vpls.reduce((sum, vpl) => sum + vpl.flux[0], 0);

  assert.deepEqual(selected.map((vpl) => vpl.id), ['source-a:2', 'source-b:1']);
  assert.equal(totalFlux(single), ONE_BOUNCE_VPL_GAIN);
  assert.equal(totalFlux(dense), ONE_BOUNCE_VPL_GAIN);
});

test('one-bounce UI and fixed-handle pipeline disclose the limited preview', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../viewer.js', import.meta.url), 'utf8');

  assert.match(html, /id="one-bounce-preview-checkbox" type="checkbox"/);
  assert.match(html, /Legacy sampled shadow \(32 proxies\)/);
  assert.match(html, /Legacy 6-VPL bounce preview/);
  assert.match(html, /id="legacy-sampled-shadow-checkbox" type="checkbox"/);
  assert.doesNotMatch(html, /id="one-bounce-preview-checkbox"[^>]*checked/);
  assert.doesNotMatch(html, /id="legacy-sampled-shadow-checkbox"[^>]*checked/);
  assert.match(source, /oneBounceFluxR: Array\.from\(\s*\{ length: ONE_BOUNCE_VPL_LIMIT \}/);
  assert.match(source, /for \(let vplIndex = 0; vplIndex < ONE_BOUNCE_VPL_LIMIT; vplIndex \+= 1\)/);
  assert.match(source, /selectOneBounceVpls\(\{/);
  assert.match(source, /directLinear\[index\] \+ \(value - linear\[index\]\)/);
  assert.match(source, /authoredSplats: definition\.splats/);
  assert.match(source, /const authoredSplatEntries = Array\.isArray\(primitiveMeta\?\.authoredSplats\)/);
  assert.match(source, /Legacy 6-VPL bounce preview enabled \(\$\{this\.activeOneBounceVplCount\}\/\$\{ONE_BOUNCE_VPL_LIMIT\} authored VPLs;/);
  assert.match(source, /this\.runtimeLightOccluders = this\.state\.legacySampledShadow/);
});

test('GPU endpoint bias and segment gate retain CPU shadow semantics', () => {
  const source = readFileSync(new URL('../viewer.js', import.meta.url), 'utf8');

  assert.match(source, /const biasedLight = sub\(lightPosition, mul\(lightDirection, endpointBias\)\);/);
  assert.match(source, /const biasedReceiver = add\(center, mul\(lightDirection, endpointBias\)\);/);
  assert.match(source, /greaterThan\(rawSegmentT, floatZero\)/);
  assert.match(source, /lessThan\(rawSegmentT, floatOne\)/);
});

test('the distance epsilon keeps near-light evaluation finite', () => {
  const contribution = evaluateDirectPointLight({
    intensity: 1,
    lightColor: [1, 1, 1],
    lightPosition: [0, 0, 1e-8],
    normal: [0, 0, 1],
    position: [0, 0, 0],
  });

  assert.deepEqual(contribution, [1 / DIRECT_LIGHT_DISTANCE_SQ_EPSILON, 1 / DIRECT_LIGHT_DISTANCE_SQ_EPSILON, 1 / DIRECT_LIGHT_DISTANCE_SQ_EPSILON]);
  assert.ok(contribution.every(Number.isFinite));
});
