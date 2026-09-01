import {
  RENDERER_MANIFEST,
  SH_C0,
  decomposeWorldMatrix,
  flattenVisibleSnapshot,
  updateFlattenedSnapshotItemTransforms,
} from "./renderer-contract.mjs";
import { linearToSrgbChannel } from "./viewer-color.mjs";

const EXPECTED_THREE_REVISION = "186dev";
const BACKEND_VENDOR_DEFINITIONS = Object.freeze({
  playcanvas: Object.freeze({
    globalName: "__SPATIAL_LOOKDEV_PLAYCANVAS__",
    source: "viewer-vendor-playcanvas.bundle.js",
  }),
  "three-r186": Object.freeze({
    globalName: "__SPATIAL_LOOKDEV_THREE_R186__",
    source: "viewer-vendor-three-r186.bundle.js",
  }),
});
const backendVendorPromises = new Map();
let PlayCanvas = globalThis.__SPATIAL_LOOKDEV_PLAYCANVAS__ ?? null;
let ThreeR186 = globalThis.__SPATIAL_LOOKDEV_THREE_R186__ ?? null;

const assignBackendVendor = (id, namespace) => {
  if (id === "playcanvas") PlayCanvas = namespace;
  if (id === "three-r186") ThreeR186 = namespace;
  return namespace;
};

const loadBackendVendor = (id, {
  documentRef = globalThis.document,
  globalRef = globalThis,
} = {}) => {
  const definition = BACKEND_VENDOR_DEFINITIONS[id];
  if (!definition) {
    return Promise.reject(new Error(`No lazy vendor bundle is configured for ${id}`));
  }
  const loaded = globalRef[definition.globalName];
  if (loaded) return Promise.resolve(assignBackendVendor(id, loaded));
  if (backendVendorPromises.has(id)) return backendVendorPromises.get(id);
  if (!documentRef?.createElement || !documentRef.head) {
    return Promise.reject(new Error(`Cannot load ${id} outside a browser document`));
  }
  const promise = new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    script.async = true;
    script.dataset.lookdevVendor = id;
    script.src = new URL(definition.source, documentRef.baseURI).href;
    script.addEventListener("load", () => {
      const namespace = globalRef[definition.globalName];
      if (!namespace) {
        script.remove();
        reject(new Error(`${id} vendor bundle loaded without registering its namespace`));
        return;
      }
      resolve(assignBackendVendor(id, namespace));
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Failed to load ${id} vendor bundle`));
    }, { once: true });
    documentRef.head.append(script);
  }).catch((error) => {
    backendVendorPromises.delete(id);
    throw error;
  });
  backendVendorPromises.set(id, promise);
  return promise;
};

const colorFromHex = (value) => {
  const hex = String(value || "#061019").replace("#", "");
  const parsed = Number.parseInt(hex.length === 3
    ? hex.split("").map((channel) => `${channel}${channel}`).join("")
    : hex.slice(0, 6), 16);
  return [
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
  ];
};

const createGsplatData = (item) => {
  const count = item.opacity.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const rot0 = new Float32Array(count);
  const rot1 = new Float32Array(count);
  const rot2 = new Float32Array(count);
  const rot3 = new Float32Array(count);
  const scale0 = new Float32Array(count);
  const scale1 = new Float32Array(count);
  const scale2 = new Float32Array(count);
  const fdc0 = new Float32Array(count);
  const fdc1 = new Float32Array(count);
  const fdc2 = new Float32Array(count);
  const opacity = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset3 = index * 3;
    const offset4 = index * 4;
    x[index] = item.center[offset3];
    y[index] = item.center[offset3 + 1];
    z[index] = item.center[offset3 + 2];
    rot0[index] = item.quaternion[offset4 + 3];
    rot1[index] = item.quaternion[offset4];
    rot2[index] = item.quaternion[offset4 + 1];
    rot3[index] = item.quaternion[offset4 + 2];
    scale0[index] = item.scale[offset3];
    scale1[index] = item.scale[offset3 + 1];
    scale2[index] = item.scale[offset3 + 2];
    // GSplat SH coefficients describe display-encoded RGB, not linear RGB.
    fdc0[index] = (linearToSrgbChannel(item.linearRgb[offset3]) - 0.5) / SH_C0;
    fdc1[index] = (linearToSrgbChannel(item.linearRgb[offset3 + 1]) - 0.5) / SH_C0;
    fdc2[index] = (linearToSrgbChannel(item.linearRgb[offset3 + 2]) - 0.5) / SH_C0;
    opacity[index] = Math.max(0, item.opacity[index] * item.opacityMultiplier);
  }
  const data = new PlayCanvas.GSplatData([{
    name: "vertex",
    count,
    properties: [
      { name: "x", type: "float", byteSize: 4, storage: x },
      { name: "y", type: "float", byteSize: 4, storage: y },
      { name: "z", type: "float", byteSize: 4, storage: z },
      { name: "rot_0", type: "float", byteSize: 4, storage: rot0 },
      { name: "rot_1", type: "float", byteSize: 4, storage: rot1 },
      { name: "rot_2", type: "float", byteSize: 4, storage: rot2 },
      { name: "rot_3", type: "float", byteSize: 4, storage: rot3 },
      { name: "scale_0", type: "float", byteSize: 4, storage: scale0 },
      { name: "scale_1", type: "float", byteSize: 4, storage: scale1 },
      { name: "scale_2", type: "float", byteSize: 4, storage: scale2 },
      { name: "f_dc_0", type: "float", byteSize: 4, storage: fdc0 },
      { name: "f_dc_1", type: "float", byteSize: 4, storage: fdc1 },
      { name: "f_dc_2", type: "float", byteSize: 4, storage: fdc2 },
      { name: "opacity", type: "float", byteSize: 4, storage: opacity },
    ],
  }]);
  // Activated data stores direct scale and alpha values. It is the public
  // PlayCanvas GSplatData form, not an undocumented Spark conversion.
  data.activated = true;
  return data;
};

const setEntityTransform = (entity, worldMatrix) => {
  const { position, quaternion, scale } = decomposeWorldMatrix(worldMatrix);
  entity.setLocalPosition(position[0], position[1], position[2]);
  entity.setLocalRotation(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);
};

class PlayCanvasBackend {
  constructor({ onFrameRequest = null } = {}) {
    this.canvas = null;
    this.app = null;
    this.cameraEntity = null;
    this.root = null;
    this.resources = [];
    this.needsSystemUpdate = false;
    this.onFrameRequest = onFrameRequest;
    this.frameRequestEvent = null;
    this.sortReadyEvent = null;
    this.hasSnapshot = false;
  }

  ensure(stage) {
    if (this.app) {
      return;
    }
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lookdev-backend-canvas";
    this.canvas.dataset.backendCanvas = "playcanvas";
    stage.append(this.canvas);
    this.app = new PlayCanvas.Application(this.canvas, {
      graphicsDeviceOptions: { antialias: false, alpha: false, powerPreference: "high-performance" },
    });
    // PlayCanvas defaults to resizing its canvas against the browser window.
    // This viewer embeds the canvas in a stage, so window-sized inline CSS
    // dimensions would overflow the stage and shift the projected scene.
    this.app.setCanvasFillMode(PlayCanvas.FILLMODE_NONE);
    this.app.setCanvasResolution(PlayCanvas.RESOLUTION_FIXED, 1, 1);
    this.app.start();
    // Application.start() initializes component systems but also owns a
    // permanent RAF. Rendering is driven by the viewer's invalidation loop,
    // so cancel the PlayCanvas tick and issue explicit frames in syncFrame().
    PlayCanvas.AppBase.cancelTick(this.app);
    this.app.autoRender = false;
    this.frameRequestEvent = this.app.systems.gsplat?.on("frame:request", () => this.onFrameRequest?.()) ?? null;
    // A CPU sort can finish after the host viewer has gone idle. Unlike
    // frame:request, this scene event is emitted directly by the sort worker,
    // so it can restart the viewer's invalidation loop without a PlayCanvas RAF.
    this.sortReadyEvent = this.app.scene.on("gsplat:sorted", () => this.onFrameRequest?.());
    this.root = new PlayCanvas.Entity("Spatial LookDev snapshot");
    this.app.root.addChild(this.root);
    this.cameraEntity = new PlayCanvas.Entity("LookDev Camera");
    this.cameraEntity.addComponent("camera", { clearColor: new PlayCanvas.Color(0.024, 0.063, 0.098, 1) });
    // Preserve the encoded splat colors without a gamma-2.2 decode/encode
    // round trip or an implicit tone mapper. Matches native sRGB splat blending.
    this.cameraEntity.camera.gammaCorrection = PlayCanvas.GAMMA_SRGB;
    this.cameraEntity.camera.toneMapping = PlayCanvas.TONEMAP_NONE;
    this.cameraEntity.camera.horizontalFov = false;
    this.app.root.addChild(this.cameraEntity);
  }

  clear() {
    this.resources.forEach(({ entity, resource }) => {
      entity.destroy();
      resource.destroy?.();
    });
    this.resources = [];
  }

  syncSnapshot(snapshot) {
    if (!this.app) {
      return;
    }
    const visibleItems = snapshot.items.filter((item) => item.visible && item.opacity.length);
    const resourcesById = new Map(this.resources.map((entry) => [entry.id, entry]));
    const topologyMatches = visibleItems.length === this.resources.length
      && visibleItems.every((item) => resourcesById.get(item.id)?.resource?.numSplats === item.opacity.length);
    if (!topologyMatches && this.hasSnapshot) {
      // Unified GSplat keeps a packed world buffer whose placement topology is
      // not reliably replaced after its permanent RAF has been cancelled.
      // Topology edits are infrequent, so rebuild only this backend; appearance
      // edits with stable ids/counts continue through the fast texture path.
      const stage = this.canvas?.parentElement;
      this.dispose();
      this.ensure(stage);
      this.canvas.classList.add("is-active-backend");
      this.syncSnapshot(snapshot);
      return;
    }
    let placementsChanged = false;
    const nextResources = visibleItems.map((item) => {
      let entry = resourcesById.get(item.id);
      if (entry?.resource?.numSplats === item.opacity.length) {
        const data = createGsplatData(item);
        entry.resource.updateColorData(data);
        entry.resource.updateTransformData(data);
        setEntityTransform(entry.entity, item.worldMatrix);
        entry.entity.gsplat.workBufferUpdate = PlayCanvas.WORKBUFFER_UPDATE_ONCE;
        resourcesById.delete(item.id);
        return entry;
      }
      if (entry) {
        entry.entity.destroy();
        entry.resource.destroy?.();
        resourcesById.delete(item.id);
      }
      const resource = new PlayCanvas.GSplatResource(this.app.graphicsDevice, createGsplatData(item));
      const entity = new PlayCanvas.Entity(item.name);
      this.root.addChild(entity);
      setEntityTransform(entity, item.worldMatrix);
      entity.addComponent("gsplat", {
        resource,
        castShadows: false,
      });
      placementsChanged = true;
      return { entity, id: item.id, resource };
    });
    resourcesById.forEach(({ entity, resource }) => {
      entity.destroy();
      resource.destroy?.();
      placementsChanged = true;
    });
    this.resources = nextResources;
    // The viewer cancels PlayCanvas' permanent RAF and renders on demand.
    // Reconcile newly added unified-GSplat placements once before the next
    // manual frame; app.render() alone does not run component systems.
    this.needsSystemUpdate ||= placementsChanged;
    this.hasSnapshot = true;
  }

  syncItemTransforms(items) {
    const byId = new Map(items.map((item) => [item.id, item]));
    this.resources.forEach(({ entity, id }) => {
      const item = byId.get(id);
      if (item) setEntityTransform(entity, item.worldMatrix);
    });
  }

  syncFrame({ camera, background, helpers, width, height, pixelRatio }) {
    if (!this.app || !this.cameraEntity) {
      return;
    }
    camera.updateMatrixWorld?.(true);
    const renderWidth = Math.max(1, Math.round(width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(height * pixelRatio));
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.app.graphicsDevice.resizeCanvas(renderWidth, renderHeight);
    this.cameraEntity.setLocalPosition(camera.position.x, camera.position.y, camera.position.z);
    this.cameraEntity.setLocalRotation(camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w);
    this.cameraEntity.camera.fov = camera.fov;
    this.cameraEntity.camera.aspectRatio = width / Math.max(height, 1);
    this.cameraEntity.camera.nearClip = camera.near;
    this.cameraEntity.camera.farClip = camera.far;
    this.cameraEntity.camera.clearColor = new PlayCanvas.Color(...colorFromHex(background), 1);
    if (this.needsSystemUpdate) {
      this.app.update(0);
      this.needsSystemUpdate = false;
    }
    // Application.tick() normally emits this before render(). Because this
    // backend is host-driven, emit it explicitly to advance unified-GSplat
    // streaming and consume completed worker sorts on every requested frame.
    this.app.fire("framerender");
    if (helpers?.showAxes) {
      const length = Math.max(Number(helpers.axesLength) || 0.5, 0.5);
      const origin = new PlayCanvas.Vec3(0, 0, 0);
      this.app.drawLine(origin, new PlayCanvas.Vec3(length, 0, 0), new PlayCanvas.Color(1, 0.24, 0.24), false);
      this.app.drawLine(origin, new PlayCanvas.Vec3(0, length, 0), new PlayCanvas.Color(0.2, 0.9, 0.38), false);
      this.app.drawLine(origin, new PlayCanvas.Vec3(0, 0, length), new PlayCanvas.Color(0.2, 0.5, 1), false);
    }
    if (helpers?.showGrid) {
      const gridSize = Math.max(Number(helpers.gridSize) || 1, 0.01);
      const gridStep = Math.max(Number(helpers.gridStep) || (gridSize / 10), 0.001);
      const half = gridSize * 0.5;
      const color = new PlayCanvas.Color(0.18, 0.3, 0.4);
      for (let offset = -half; offset <= half + (gridStep * 0.5); offset += gridStep) {
        this.app.drawLine(new PlayCanvas.Vec3(-half, 0, offset), new PlayCanvas.Vec3(half, 0, offset), color, false);
        this.app.drawLine(new PlayCanvas.Vec3(offset, 0, -half), new PlayCanvas.Vec3(offset, 0, half), color, false);
      }
    }
    if (helpers?.showBounds && helpers.bounds) {
      const { min, max } = helpers.bounds;
      const corners = [
        [min[0], min[1], min[2]], [max[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]],
        [min[0], min[1], max[2]], [max[0], min[1], max[2]], [min[0], max[1], max[2]], [max[0], max[1], max[2]],
      ].map((point) => new PlayCanvas.Vec3(...point));
      const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const color = new PlayCanvas.Color(0.72, 0.91, 1);
      edges.forEach(([from, to]) => this.app.drawLine(corners[from], corners[to], color, false));
    }
    this.app.render();
  }

  get telemetry() {
    const device = this.app?.graphicsDevice;
    const renderer = device?.isWebGPU ? "WebGPU" : "WebGL";
    return `PlayCanvas ${PlayCanvas.version || "2.21.2"} · ${renderer} · GSplat`;
  }

  dispose() {
    this.clear();
    this.frameRequestEvent?.off?.();
    this.frameRequestEvent = null;
    this.sortReadyEvent?.off?.();
    this.sortReadyEvent = null;
    this.app?.destroy();
    this.canvas?.remove();
    this.app = null;
    this.canvas = null;
    this.cameraEntity = null;
    this.root = null;
    this.needsSystemUpdate = false;
    this.hasSnapshot = false;
  }
}

const gaussianVertexShader = /* glsl */`
precision highp float;
attribute vec2 corner;
attribute vec3 splatCenter;
attribute vec3 splatCovarianceDiagonal;
attribute vec3 splatCovarianceOffDiagonal;
attribute vec3 splatColor;
attribute float splatOpacity;
uniform vec2 renderSize;
varying vec2 vGaussianUv;
varying vec3 vColor;
varying float vOpacity;

void main() {
  vec4 viewCenter4 = viewMatrix * vec4(splatCenter, 1.0);
  vec3 viewCenter = viewCenter4.xyz;
  float viewDepth = -viewCenter.z;
  if (viewDepth <= 0.00001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 clipCenter = projectionMatrix * viewCenter4;
  mat3 viewRotation = mat3(viewMatrix);
  mat3 covarianceWorld = mat3(
    splatCovarianceDiagonal.x, splatCovarianceOffDiagonal.x, splatCovarianceOffDiagonal.y,
    splatCovarianceOffDiagonal.x, splatCovarianceDiagonal.y, splatCovarianceOffDiagonal.z,
    splatCovarianceOffDiagonal.y, splatCovarianceOffDiagonal.z, splatCovarianceDiagonal.z
  );
  mat3 covariance3d = viewRotation * covarianceWorld * transpose(viewRotation);
  vec2 focal = 0.5 * renderSize * vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  vec3 jacobianX = vec3(focal.x / viewDepth, 0.0, focal.x * viewCenter.x / (viewDepth * viewDepth));
  vec3 jacobianY = vec3(0.0, focal.y / viewDepth, focal.y * viewCenter.y / (viewDepth * viewDepth));
  float covarianceXX = max(dot(jacobianX, covariance3d * jacobianX), 0.0001);
  float covarianceXY = dot(jacobianX, covariance3d * jacobianY);
  float covarianceYY = max(dot(jacobianY, covariance3d * jacobianY), 0.0001);
  float mean = 0.5 * (covarianceXX + covarianceYY);
  float spread = sqrt(max(0.0, mean * mean - (covarianceXX * covarianceYY - covarianceXY * covarianceXY)));
  float eigenMajor = max(mean + spread, 0.0001);
  float eigenMinor = max(mean - spread, 0.0001);
  vec2 axisMajor = abs(covarianceXY) > 0.00001
    ? normalize(vec2(covarianceXY, eigenMajor - covarianceXX))
    : (covarianceXX >= covarianceYY ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 axisMinor = vec2(-axisMajor.y, axisMajor.x);
  vec2 pixelOffset = 3.0 * (corner.x * axisMajor * sqrt(eigenMajor) + corner.y * axisMinor * sqrt(eigenMinor));
  vec2 ndcOffset = (2.0 * pixelOffset) / renderSize;
  vec3 ndcCenter = clipCenter.xyz / clipCenter.w;
  gl_Position = vec4((ndcCenter.xy + ndcOffset) * clipCenter.w, clipCenter.zw);
  vGaussianUv = corner * 3.0;
  vColor = splatColor;
  vOpacity = splatOpacity;
}
`;

const gaussianFragmentShader = /* glsl */`
precision highp float;
varying vec2 vGaussianUv;
varying vec3 vColor;
varying float vOpacity;
void main() {
  float radiusSquared = dot(vGaussianUv, vGaussianUv);
  if (radiusSquared > 9.0) discard;
  float alpha = clamp(vOpacity * exp(-0.5 * radiusSquared), 0.0, 1.0);
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <premultiplied_alpha_fragment>
}
`;

class ThreeR186Backend {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.geometry = null;
    this.material = null;
    this.mesh = null;
    this.snapshot = null;
    this.flat = null;
    this.sorted = null;
    this.sortedAttributes = null;
    this.order = new Uint32Array(0);
    this.lastSortView = new Float64Array(16);
    this.sortInvalidated = true;
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.lastPixelRatio = 0;
    this.axesHelper = null;
    this.gridHelper = null;
    this.gridDivisions = 0;
    this.boundsBox = null;
    this.boundsHelper = null;
  }

  ensure(stage) {
    if (ThreeR186.REVISION !== EXPECTED_THREE_REVISION) {
      throw new Error(`ThreeR186Backend requires ${EXPECTED_THREE_REVISION}; received ${ThreeR186.REVISION}`);
    }
    if (this.renderer) {
      return;
    }
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lookdev-backend-canvas";
    this.canvas.dataset.backendCanvas = "three-r186";
    stage.append(this.canvas);
    this.renderer = new ThreeR186.WebGLRenderer({ canvas: this.canvas, alpha: false, antialias: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = ThreeR186.SRGBColorSpace;
    this.renderer.toneMapping = ThreeR186.NoToneMapping;
    this.renderer.setPixelRatio(1);
    this.scene = new ThreeR186.Scene();
    this.camera = new ThreeR186.PerspectiveCamera(60, 1, 0.0005, 5000);
    this.geometry = new ThreeR186.InstancedBufferGeometry();
    this.geometry.setAttribute("corner", new ThreeR186.Float32BufferAttribute([-1, -1, 1, -1, -1, 1, 1, 1], 2));
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.material = new ThreeR186.ShaderMaterial({
      transparent: true,
      premultipliedAlpha: true,
      depthTest: true,
      depthWrite: false,
      blending: ThreeR186.CustomBlending,
      blendSrc: ThreeR186.OneFactor,
      blendDst: ThreeR186.OneMinusSrcAlphaFactor,
      uniforms: { renderSize: { value: new ThreeR186.Vector2(1, 1) } },
      vertexShader: gaussianVertexShader,
      fragmentShader: gaussianFragmentShader,
    });
    this.mesh = new ThreeR186.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.axesHelper = new ThreeR186.AxesHelper(1);
    this.axesHelper.visible = false;
    this.scene.add(this.axesHelper);
    this.gridHelper = new ThreeR186.GridHelper(1, 10, 0x5ce2c3, 0x20384d);
    this.gridHelper.visible = false;
    this.scene.add(this.gridHelper);
    this.boundsBox = new ThreeR186.Box3();
    this.boundsHelper = new ThreeR186.Box3Helper(this.boundsBox, 0xb7e7ff);
    this.boundsHelper.visible = false;
    this.scene.add(this.boundsHelper);
  }

  syncSnapshot(snapshot) {
    if (!this.geometry) {
      return;
    }
    this.snapshot = snapshot;
    this.flat = flattenVisibleSnapshot(snapshot, { includeQuaternion: false, includeCovariance: true });
    if (!this.sorted || this.sorted.opacity.length !== this.flat.count) {
      this.geometry.dispose();
      this.sorted = {
        center: new Float32Array(this.flat.count * 3),
        covarianceDiagonal: new Float32Array(this.flat.count * 3),
        covarianceOffDiagonal: new Float32Array(this.flat.count * 3),
        linearRgb: new Float32Array(this.flat.count * 3),
        opacity: new Float32Array(this.flat.count),
      };
      this.sortedAttributes = {
        center: new ThreeR186.InstancedBufferAttribute(this.sorted.center, 3).setUsage(ThreeR186.DynamicDrawUsage),
        covarianceDiagonal: new ThreeR186.InstancedBufferAttribute(this.sorted.covarianceDiagonal, 3).setUsage(ThreeR186.DynamicDrawUsage),
        covarianceOffDiagonal: new ThreeR186.InstancedBufferAttribute(this.sorted.covarianceOffDiagonal, 3).setUsage(ThreeR186.DynamicDrawUsage),
        linearRgb: new ThreeR186.InstancedBufferAttribute(this.sorted.linearRgb, 3).setUsage(ThreeR186.DynamicDrawUsage),
        opacity: new ThreeR186.InstancedBufferAttribute(this.sorted.opacity, 1).setUsage(ThreeR186.DynamicDrawUsage),
      };
      this.geometry.setAttribute("splatCenter", this.sortedAttributes.center);
      this.geometry.setAttribute("splatCovarianceDiagonal", this.sortedAttributes.covarianceDiagonal);
      this.geometry.setAttribute("splatCovarianceOffDiagonal", this.sortedAttributes.covarianceOffDiagonal);
      this.geometry.setAttribute("splatColor", this.sortedAttributes.linearRgb);
      this.geometry.setAttribute("splatOpacity", this.sortedAttributes.opacity);
    }
    if (this.order.length !== this.flat.count) {
      this.order = new Uint32Array(this.flat.count);
      for (let index = 0; index < this.order.length; index += 1) this.order[index] = index;
    }
    this.sortInvalidated = true;
    this.geometry.instanceCount = this.flat.count;
    // Refresh GPU attributes immediately in the last camera order. The next
    // frame may re-sort for a changed camera, but appearance-only snapshots
    // must not wait for a later camera movement before becoming visible.
    this.sortByCamera(this.camera);
  }

  syncItemTransforms(items) {
    const nextFlat = updateFlattenedSnapshotItemTransforms(this.snapshot, this.flat, items);
    if (nextFlat !== this.flat) {
      this.flat = nextFlat;
      this.sortInvalidated = true;
    }
  }

  sortByCamera(sourceCamera) {
    if (!this.flat || !this.sorted) {
      return;
    }
    sourceCamera.updateMatrixWorld?.(true);
    const view = sourceCamera.matrixWorldInverse.elements;
    if (!this.sortInvalidated && view.every((value, index) => value === this.lastSortView[index])) return;
    this.lastSortView.set(view);
    this.order.sort((left, right) => {
      const leftOffset = left * 3;
      const rightOffset = right * 3;
      const leftDepth = (view[2] * this.flat.center[leftOffset]) + (view[6] * this.flat.center[leftOffset + 1]) + (view[10] * this.flat.center[leftOffset + 2]) + view[14];
      const rightDepth = (view[2] * this.flat.center[rightOffset]) + (view[6] * this.flat.center[rightOffset + 1]) + (view[10] * this.flat.center[rightOffset + 2]) + view[14];
      return leftDepth - rightDepth || left - right;
    });
    for (let output = 0; output < this.order.length; output += 1) {
      const source = this.order[output];
      const source3 = source * 3;
      const output3 = output * 3;
      this.sorted.center[output3] = this.flat.center[source3];
      this.sorted.center[output3 + 1] = this.flat.center[source3 + 1];
      this.sorted.center[output3 + 2] = this.flat.center[source3 + 2];
      this.sorted.covarianceDiagonal[output3] = this.flat.covarianceDiagonal[source3];
      this.sorted.covarianceDiagonal[output3 + 1] = this.flat.covarianceDiagonal[source3 + 1];
      this.sorted.covarianceDiagonal[output3 + 2] = this.flat.covarianceDiagonal[source3 + 2];
      this.sorted.covarianceOffDiagonal[output3] = this.flat.covarianceOffDiagonal[source3];
      this.sorted.covarianceOffDiagonal[output3 + 1] = this.flat.covarianceOffDiagonal[source3 + 1];
      this.sorted.covarianceOffDiagonal[output3 + 2] = this.flat.covarianceOffDiagonal[source3 + 2];
      this.sorted.linearRgb[output3] = this.flat.linearRgb[source3];
      this.sorted.linearRgb[output3 + 1] = this.flat.linearRgb[source3 + 1];
      this.sorted.linearRgb[output3 + 2] = this.flat.linearRgb[source3 + 2];
      this.sorted.opacity[output] = this.flat.opacity[source];
    }
    this.sortedAttributes.center.needsUpdate = true;
    this.sortedAttributes.covarianceDiagonal.needsUpdate = true;
    this.sortedAttributes.covarianceOffDiagonal.needsUpdate = true;
    this.sortedAttributes.linearRgb.needsUpdate = true;
    this.sortedAttributes.opacity.needsUpdate = true;
    this.sortInvalidated = false;
  }

  syncFrame({ camera, background, helpers, width, height, pixelRatio }) {
    if (!this.renderer || !this.camera) {
      return;
    }
    if (pixelRatio !== this.lastPixelRatio) {
      this.renderer.setPixelRatio(pixelRatio);
      this.lastPixelRatio = pixelRatio;
      this.lastWidth = 0;
      this.lastHeight = 0;
    }
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.renderer.setSize(width, height, false);
      this.lastWidth = width;
      this.lastHeight = height;
    }
    this.renderer.setClearColor(background);
    this.camera.fov = camera.fov;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.near = camera.near;
    this.camera.far = camera.far;
    this.camera.position.copy(camera.position);
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.material.uniforms.renderSize.value.set(width * pixelRatio, height * pixelRatio);
    const axesLength = Math.max(Number(helpers?.axesLength) || 0.5, 0.5);
    this.axesHelper.visible = Boolean(helpers?.showAxes);
    this.axesHelper.scale.setScalar(axesLength);
    const gridSize = Math.max(Number(helpers?.gridSize) || 1, 0.01);
    const gridStep = Math.max(Number(helpers?.gridStep) || (gridSize / 10), 0.001);
    const gridDivisions = Math.max(1, Math.round(gridSize / gridStep));
    if (gridDivisions !== this.gridDivisions) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      this.gridHelper.material.dispose();
      this.gridHelper = new ThreeR186.GridHelper(1, gridDivisions, 0x5ce2c3, 0x20384d);
      this.scene.add(this.gridHelper);
      this.gridDivisions = gridDivisions;
    }
    this.gridHelper.visible = Boolean(helpers?.showGrid);
    this.gridHelper.scale.setScalar(gridSize);
    this.boundsHelper.visible = Boolean(helpers?.showBounds && helpers.bounds);
    if (helpers?.bounds) {
      this.boundsBox.min.set(...helpers.bounds.min);
      this.boundsBox.max.set(...helpers.bounds.max);
    }
    this.sortByCamera(camera);
    this.renderer.render(this.scene, this.camera);
  }

  get telemetry() {
    return `THREE.REVISION ${ThreeR186.REVISION} · WebGLRenderer · covariance ellipses`;
  }

  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
    this.canvas?.remove();
    this.renderer = null;
    this.canvas = null;
    this.scene = null;
    this.camera = null;
    this.geometry = null;
    this.material = null;
    this.mesh = null;
    this.snapshot = null;
    this.flat = null;
    this.sorted = null;
    this.sortedAttributes = null;
    this.order = new Uint32Array(0);
  }
}

export class LookDevBackendManager {
  constructor({ stage, inputCanvas, onFrameRequest, onTelemetry, onStatus, loadVendor = loadBackendVendor }) {
    this.stage = stage;
    this.inputCanvas = inputCanvas;
    this.onTelemetry = onTelemetry;
    this.onStatus = onStatus;
    this.loadVendor = loadVendor;
    this.activeId = "spark";
    this.activationToken = 0;
    this.snapshot = Object.freeze({ version: 1, items: Object.freeze([]), splatCount: 0 });
    this.backends = new Map([
      ["playcanvas", new PlayCanvasBackend({ onFrameRequest })],
      ["three-r186", new ThreeR186Backend()],
    ]);
    this.updateCanvasVisibility();
    this.emitTelemetry();
  }

  isSparkActive() {
    return this.activeId === "spark";
  }

  get activeBackend() {
    return this.backends.get(this.activeId) ?? null;
  }

  emitTelemetry() {
    const backend = RENDERER_MANIFEST[this.activeId];
    const rendererTelemetry = this.activeBackend?.telemetry ?? "Spark 2.0 · native canvas";
    this.onTelemetry?.({
      id: this.activeId,
      label: backend.label,
      splatCount: this.snapshot.splatCount,
      text: `${rendererTelemetry} · ${backend.capabilities.sh}`,
    });
  }

  updateCanvasVisibility() {
    this.inputCanvas.classList.toggle("is-overlay-input", !this.isSparkActive());
    this.inputCanvas.classList.toggle("is-active-backend", this.isSparkActive());
    this.backends.forEach((backend, id) => {
      backend.canvas?.classList.toggle("is-active-backend", id === this.activeId);
    });
  }

  async setActive(id, { getSnapshot } = {}) {
    if (!RENDERER_MANIFEST[id]) {
      throw new Error(`Unsupported renderer backend: ${id}`);
    }
    const activationToken = ++this.activationToken;
    if (id !== "spark") {
      await this.loadVendor(id);
    }
    if (activationToken !== this.activationToken) return false;
    const previousId = this.activeId;
    if (previousId === id) return true;
    let nextSnapshot = this.snapshot;
    if (id !== "spark") {
      const backend = this.backends.get(id);
      try {
        // Capture after the async vendor load: edits, file loads and visibility
        // changes during that wait must be present in the first new frame.
        nextSnapshot = getSnapshot ? getSnapshot() : this.snapshot;
        backend.ensure(this.stage);
        backend.syncSnapshot(nextSnapshot);
      } catch (error) {
        backend.dispose();
        this.updateCanvasVisibility();
        throw error;
      }
    }
    // Keep the prior canvas alive until the replacement is fully prepared.
    this.snapshot = nextSnapshot;
    this.activeId = id;
    this.updateCanvasVisibility();
    if (previousId !== "spark") {
      this.backends.get(previousId)?.dispose();
    }
    this.emitTelemetry();
    this.onStatus?.(`${RENDERER_MANIFEST[id].label} active`);
    return true;
  }

  setSnapshot(snapshot, { syncActive = true } = {}) {
    this.snapshot = snapshot;
    if (syncActive) this.activeBackend?.syncSnapshot(snapshot);
    this.emitTelemetry();
  }

  syncItemTransforms(items) {
    this.activeBackend?.syncItemTransforms?.(items);
  }

  renderFrame({ camera, background, helpers, width, height, pixelRatio }) {
    this.activeBackend?.syncFrame({ camera, background, helpers, width, height, pixelRatio });
  }

  dispose() {
    this.activationToken += 1;
    this.backends.forEach((backend) => backend.dispose());
  }
}

export {
  BACKEND_VENDOR_DEFINITIONS,
  EXPECTED_THREE_REVISION,
  gaussianFragmentShader,
  gaussianVertexShader,
  loadBackendVendor,
};
