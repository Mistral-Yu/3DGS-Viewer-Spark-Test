import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySimilarityTransform,
  buildAlignmentPairs,
  computeRigidAlignment,
  formatAlignPointLabel,
} from "../viewer-align.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const viewerSource = fs.readFileSync(path.join(projectRoot, "viewer.js"), "utf8");

const nearlyEqual = (actual, expected, epsilon = 1e-6) => {
  assert.equal(Number.isFinite(actual), true, `expected finite number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);
};

const nearlyPoint = (actual, expected, epsilon = 1e-6) => {
  nearlyEqual(actual.x, expected.x, epsilon);
  nearlyEqual(actual.y, expected.y, epsilon);
  nearlyEqual(actual.z, expected.z, epsilon);
};

test("computeRigidAlignment maps three source markers onto the matching target markers", () => {
  const source = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ];
  const target = [
    { x: 10, y: -2, z: 3 },
    { x: 10, y: 0, z: 3 },
    { x: 8, y: -2, z: 3 },
  ];

  const transform = computeRigidAlignment({ sourcePoints: source, targetPoints: target });

  nearlyEqual(transform.scale, 2);
  source.forEach((point, index) => {
    nearlyPoint(applySimilarityTransform(point, transform), target[index]);
  });
});

test("computeRigidAlignment supports more than three numbered pairs", () => {
  const source = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ];
  const target = [
    { x: 4, y: 1, z: -2 },
    { x: 5.5, y: 1, z: -2 },
    { x: 4, y: 2.5, z: -2 },
    { x: 5.5, y: 2.5, z: -2 },
  ];

  const pairs = buildAlignmentPairs({ sourcePoints: source, targetPoints: target });
  const transform = computeRigidAlignment({ sourcePoints: source, targetPoints: target });

  assert.deepEqual(pairs.map((pair) => pair.index), [1, 2, 3, 4]);
  source.forEach((point, index) => {
    nearlyPoint(applySimilarityTransform(point, transform), target[index]);
  });
});

test("computeRigidAlignment rejects underconstrained or collinear point sets", () => {
  assert.throws(
    () => computeRigidAlignment({ sourcePoints: [{ x: 0, y: 0, z: 0 }], targetPoints: [{ x: 0, y: 0, z: 0 }] }),
    /at least 3/i,
  );
  assert.throws(
    () => computeRigidAlignment({
      sourcePoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
      targetPoints: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    }),
    /non-collinear/i,
  );
});

test("formatAlignPointLabel numbers matching marker pairs", () => {
  assert.equal(formatAlignPointLabel({ role: "source", index: 2 }), "S2");
  assert.equal(formatAlignPointLabel({ role: "target", index: 2 }), "T2");
});

test("index exposes an Align inspector tab with source, target, point, apply, and reset controls", () => {
  assert.match(indexHtml, /data-inspector-tab="align"/);
  assert.match(indexHtml, /id="align-source-select"/);
  assert.match(indexHtml, /id="align-target-select"/);
  assert.match(indexHtml, /id="align-add-point-button"/);
  assert.match(indexHtml, /id="align-apply-button"/);
  assert.match(indexHtml, /id="align-reset-button"/);
});

test("viewer wires align controls, editable points, reset, and applies results into splat transforms", () => {
  assert.match(viewerSource, /import .*computeRigidAlignment.*from "\.\/viewer-align\.mjs"/s);
  assert.match(viewerSource, /alignSourceSelect: document\.getElementById\("align-source-select"\)/);
  assert.match(viewerSource, /this\.dom\.alignApplyButton\?\.addEventListener\("click", \(\) => this\.applyAlignment\(\)\)/);
  assert.match(viewerSource, /this\.dom\.alignResetButton\?\.addEventListener\("click", \(\) => this\.resetAlignment\(\)\)/);
  assert.match(viewerSource, /updateAlignPointCoordinate\(/);
  assert.match(viewerSource, /removeAlignPointPair\(/);
  assert.match(viewerSource, /applyAlignment\(\)/);
  assert.match(viewerSource, /matrix4\.decompose\(translation, quaternion, scaleVector\)/);
  assert.match(viewerSource, /sourceItem\.transform\.translateX = sourceItem\.modelRoot\.position\.x/);
  assert.match(viewerSource, /sourceItem\.transform\.rotationZ = THREE\.MathUtils\.radToDeg\(sourceItem\.rotationPivot\.rotation\.z\)/);
  assert.match(viewerSource, /sourceItem\.transform\.scale = sourceItem\.rotationPivot\.scale\.x/);
});
