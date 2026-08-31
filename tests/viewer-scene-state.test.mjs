import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "../vendor/three/three.module.js";
import { computeRigidAlignment } from "../viewer-align.mjs";

const source = readFileSync(new URL("../viewer.js", import.meta.url), "utf8");
const method = (name, bindings = {}) => {
  const start = new RegExp(`^      (?:async )?${name}\\(`, "m").exec(source)?.index;
  assert.ok(start >= 0, name);
  const next = /\n      (?:async )?\w+\(/.exec(source.slice(start));
  const code = source.slice(start, next ? start + next.index : undefined);
  return new Function(...Object.keys(bindings), `return ({${code}}).${name};`)(...Object.values(bindings));
};

const reconcile = method("reconcileAlignPointContext");
const applyAlignment = method("applyAlignment", { THREE, computeRigidAlignment });
const makeItem = (id) => {
  const modelRoot = new THREE.Group();
  const rotationPivot = new THREE.Group();
  const mesh = new THREE.Object3D();
  modelRoot.add(rotationPivot);
  rotationPivot.add(mesh);
  return { id, modelRoot, rotationPivot, mesh, geometryRevision: 0, modelMeta: { name: id }, transform: {} };
};
const makeAlignViewer = () => {
  const a = makeItem("a"), b = makeItem("b");
  const selections = { source: a, target: b };
  const viewer = {
    alignPointContext: null, alignPoints: { source: [], target: [] }, alignPickMode: true,
    state: {}, selections, status: "", disposed: 0,
    getAlignSelection(role) { return selections[role]; },
    disposeAlignMarkers() { this.disposed += 1; },
    updateStatus(value) { this.status = value; }, forceVisualRefresh() {},
    reconcileAlignPointContext() { return reconcile.call(this); },
    snapshotSceneItemTransform(item) { return { itemId: item.id, transform: { ...item.transform } }; },
    refreshSceneAfterAlignTransform(item) { item.modelRoot.updateMatrixWorld(true); this.reconcileAlignPointContext(); },
  };
  viewer.reconcileAlignPointContext();
  return viewer;
};

test("alignment points are invalidated by participant, transform, geometry, and deletion changes", () => {
  const viewer = makeAlignViewer();
  const seed = () => { viewer.alignPoints.source.push(new THREE.Vector3(1, 2, 3)); };
  seed();
  assert.equal(viewer.reconcileAlignPointContext(), false);
  assert.equal(viewer.alignPoints.source.length, 1);
  viewer.selections.source = makeItem("replacement");
  assert.equal(viewer.reconcileAlignPointContext(), true);
  assert.equal(viewer.alignPoints.source.length, 0);
  seed();
  viewer.selections.source.modelRoot.position.x = 2;
  viewer.reconcileAlignPointContext();
  assert.equal(viewer.alignPoints.source.length, 0);
  seed();
  viewer.selections.target.geometryRevision += 1;
  viewer.reconcileAlignPointContext();
  assert.equal(viewer.alignPoints.source.length, 0);
  seed();
  viewer.selections.target = null;
  viewer.reconcileAlignPointContext();
  assert.equal(viewer.alignPoints.source.length, 0);
  assert.equal(viewer.alignPickMode, false);
});

test("identity alignment preserves an existing source rotation and scale", () => {
  const viewer = makeAlignViewer();
  const item = viewer.selections.source;
  item.modelRoot.position.set(1, 2, 3);
  item.rotationPivot.rotation.set(0.3, -0.2, Math.PI / 2);
  item.rotationPivot.scale.setScalar(2);
  viewer.reconcileAlignPointContext();
  const before = item.rotationPivot.matrixWorld.clone();
  const points = [new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]
    .map((point) => point.applyMatrix4(before));
  viewer.alignPoints = { source: points, target: points.map((point) => point.clone()) };
  applyAlignment.call(viewer);
  item.modelRoot.updateMatrixWorld(true);
  before.elements.forEach((value, index) => assert.ok(Math.abs(value - item.rotationPivot.matrixWorld.elements[index]) < 1e-6));
});

test("a nontrivial alignment disarms its world-space points and cannot compound on a second Apply", () => {
  const viewer = makeAlignViewer();
  const item = viewer.selections.source;
  item.rotationPivot.rotation.z = 0.4;
  item.rotationPivot.scale.setScalar(1.5);
  viewer.reconcileAlignPointContext();
  const oldWorld = item.rotationPivot.matrixWorld.clone();
  const delta = new THREE.Matrix4().makeRotationY(0.25).scale(new THREE.Vector3(1.2, 1.2, 1.2)).setPosition(3, -2, 1);
  const points = [new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]
    .map((point) => point.applyMatrix4(oldWorld));
  viewer.alignPoints = { source: points, target: points.map((point) => point.clone().applyMatrix4(delta)) };
  applyAlignment.call(viewer);
  const expected = delta.clone().multiply(oldWorld);
  expected.elements.forEach((value, index) => assert.ok(Math.abs(value - item.rotationPivot.matrixWorld.elements[index]) < 1e-6));
  assert.deepEqual(viewer.alignPoints, { source: [], target: [] });
  const snapshot = viewer.lastAlignmentSnapshot;
  const once = item.rotationPivot.matrixWorld.clone();
  applyAlignment.call(viewer);
  assert.deepEqual(item.rotationPivot.matrixWorld.elements, once.elements);
  assert.equal(viewer.lastAlignmentSnapshot, snapshot);
});

test("rapid additive requests serialize, preserve both additions, and recover after rejection", async () => {
  const enqueue = method("enqueueSceneLoad");
  const viewer = { sceneLoadEpoch: 0, loadToken: 0, sceneLoadQueue: Promise.resolve() };
  const started = [], completed = [];
  let finishFirst;
  const first = enqueue.call(viewer, (token) => {
    started.push(token);
    return new Promise((resolve) => { finishFirst = () => { completed.push("first"); resolve(true); }; });
  });
  const second = enqueue.call(viewer, (token) => { started.push(token); completed.push("second"); return true; });
  await Promise.resolve();
  assert.deepEqual(started, [1]);
  finishFirst();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(completed, ["first", "second"]);
  await assert.rejects(enqueue.call(viewer, () => { throw new Error("decode failed"); }));
  assert.equal(await enqueue.call(viewer, () => true), true);
});

test("clearing a scene cancels queued additions but accepts new requests", async () => {
  const enqueue = method("enqueueSceneLoad");
  const viewer = { sceneLoadEpoch: 0, loadToken: 0, sceneLoadQueue: Promise.resolve() };
  let ran = false;
  const canceled = enqueue.call(viewer, () => { ran = true; });
  viewer.sceneLoadEpoch += 1;
  viewer.loadToken += 1;
  assert.equal(await canceled, false);
  assert.equal(ran, false);
  assert.equal(await enqueue.call(viewer, () => "new scene"), "new scene");
  assert.match(source, /clearScene\(\)[\s\S]*?this\.sceneLoadEpoch \+= 1;[\s\S]*?this\.loadToken \+= 1;/);
});

test("half-turn Gaussian quaternions preserve w=0 when editing or restoring geometry", () => {
  const getQuaternion = method("getSplatQuaternion", { THREE });
  assert.deepEqual(getQuaternion({ quaternion: { x: 0, y: 1, z: 0, w: 0 } }).toArray(), [0, 1, 0, 0]);
  assert.deepEqual(getQuaternion({ rot: [0, 1, 0, 0] }).toArray(), [1, 0, 0, 0]);
});
