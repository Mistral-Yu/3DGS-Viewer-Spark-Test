(function () {
  const MACBETH_EXR_SOURCE_URL =
    "https://raw.githubusercontent.com/colour-science/colour-nuke/master/colour_nuke/resources/images/ColorChecker2014/sRGB_ColorChecker2014.exr";

  const MACBETH_LINEAR_SRGB = [
    { name: "Dark Skin", linear: [0.173795, 0.078826, 0.053278] },
    { name: "Light Skin", linear: [0.560018, 0.277344, 0.211374] },
    { name: "Blue Sky", linear: [0.105262, 0.189462, 0.327258] },
    { name: "Foliage", linear: [0.105252, 0.150381, 0.052199] },
    { name: "Blue Flower", linear: [0.228946, 0.213441, 0.422734] },
    { name: "Bluish Green", linear: [0.114476, 0.507630, 0.413179] },
    { name: "Orange", linear: [0.744047, 0.201402, 0.032548] },
    { name: "Purplish Blue", linear: [0.060553, 0.102618, 0.383053] },
    { name: "Moderate Red", linear: [0.561840, 0.080835, 0.114428] },
    { name: "Purple", linear: [0.109582, 0.042489, 0.136729] },
    { name: "Yellow Green", linear: [0.329176, 0.494601, 0.048830] },
    { name: "Orange Yellow", linear: [0.767517, 0.355728, 0.025377] },
    { name: "Blue", linear: [0.022476, 0.048798, 0.281168] },
    { name: "Green", linear: [0.044434, 0.290314, 0.064476] },
    { name: "Red", linear: [0.445520, 0.036741, 0.040636] },
    { name: "Yellow", linear: [0.837117, 0.570918, 0.012717] },
    { name: "Magenta", linear: [0.523482, 0.079120, 0.286364] },
    { name: "Cyan", linear: [0.000000, 0.234350, 0.375000] },
    { name: "White 9.5", linear: [0.880061, 0.884344, 0.835094] },
    { name: "Neutral 8", linear: [0.585344, 0.593164, 0.585344] },
    { name: "Neutral 6.5", linear: [0.358357, 0.367172, 0.366175] },
    { name: "Neutral 5", linear: [0.189830, 0.191285, 0.189569] },
    { name: "Neutral 3.5", linear: [0.085938, 0.088851, 0.089840] },
    { name: "Black 2", linear: [0.031296, 0.031433, 0.032268] },
  ];

  const createSpherePrimitive = ({ THREE, helpers }) => {
    const radius = 1;
    const splatCount = 720;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const splats = [];
    for (let index = 0; index < splatCount; index += 1) {
      const y = 1 - ((index + 0.5) / splatCount) * 2;
      const radial = Math.sqrt(Math.max(1 - (y * y), 0));
      const phi = index * goldenAngle;
      const normal = new THREE.Vector3(
        Math.cos(phi) * radial,
        y,
        Math.sin(phi) * radial,
      ).normalize();
      const position = normal.clone().multiplyScalar(radius);
      const color = new THREE.Color(
        normal.x * 0.5 + 0.5,
        normal.y * 0.5 + 0.5,
        normal.z * 0.5 + 0.5,
      );
      splats.push({
        alpha: 0.86,
        color,
        normal,
        position,
        quaternion: helpers.createQuaternionFromNormal(normal),
        scale: new THREE.Vector3(0.12, 0.12, 0.045),
      });
    }
    return {
      compression: "Procedural binary PLY",
      compressionRatio: "-",
      defaultSettings: {
        falloff: 1,
        opacity: 1,
      },
      encoding: "Runtime-authored SH0 surface splats",
      format: "PLY",
      localBounds: new THREE.Box3(
        new THREE.Vector3(-radius, -radius, -radius),
        new THREE.Vector3(radius, radius, radius),
      ),
      name: "Primitive Sphere",
      packedCapacity: "-",
      scaleRange: helpers.formatScaleRange(0.045, 0.12),
      shDegree: 0,
      source: "Generated primitive",
      splats,
    };
  };

  const createCubePrimitive = ({ THREE, helpers }) => {
    const halfExtent = 1;
    const steps = 18;
    const splats = [];
    const faceDefs = [
      { axis: "x", sign: -1, normal: new THREE.Vector3(-1, 0, 0) },
      { axis: "x", sign: 1, normal: new THREE.Vector3(1, 0, 0) },
      { axis: "y", sign: -1, normal: new THREE.Vector3(0, -1, 0) },
      { axis: "y", sign: 1, normal: new THREE.Vector3(0, 1, 0) },
      { axis: "z", sign: -1, normal: new THREE.Vector3(0, 0, -1) },
      { axis: "z", sign: 1, normal: new THREE.Vector3(0, 0, 1) },
    ];
    faceDefs.forEach(({ axis, normal, sign }) => {
      for (let row = 0; row < steps; row += 1) {
        for (let column = 0; column < steps; column += 1) {
          const a = ((column + 0.5) / steps) * 2 - 1;
          const b = ((row + 0.5) / steps) * 2 - 1;
          const position = new THREE.Vector3();
          if (axis === "x") {
            position.set(sign * halfExtent, a * halfExtent, b * halfExtent);
          } else if (axis === "y") {
            position.set(a * halfExtent, sign * halfExtent, b * halfExtent);
          } else {
            position.set(a * halfExtent, b * halfExtent, sign * halfExtent);
          }
          const color = new THREE.Color(
            position.x * 0.25 + 0.5,
            position.y * 0.25 + 0.5,
            position.z * 0.25 + 0.5,
          );
          splats.push({
            alpha: 0.9,
            color,
            normal: normal.clone(),
            position,
            quaternion: helpers.createQuaternionFromNormal(normal),
            scale: new THREE.Vector3(0.11, 0.11, 0.04),
          });
        }
      }
    });
    return {
      compression: "Procedural binary PLY",
      compressionRatio: "-",
      defaultSettings: {
        falloff: 1,
        opacity: 1,
      },
      encoding: "Runtime-authored SH0 surface splats",
      format: "PLY",
      localBounds: new THREE.Box3(
        new THREE.Vector3(-halfExtent, -halfExtent, -halfExtent),
        new THREE.Vector3(halfExtent, halfExtent, halfExtent),
      ),
      name: "Primitive Cube",
      packedCapacity: "-",
      scaleRange: helpers.formatScaleRange(0.04, 0.11),
      shDegree: 0,
      source: "Generated primitive",
      splats,
    };
  };

  const createMacbethPrimitive = ({ THREE, helpers }) => {
    const patchColumns = 6;
    const patchRows = 4;
    const patchStep = 0.22;
    const patchGap = 0.03;
    const patchSubdivisions = 3;
    const patchLayerOffsets = [-0.0025, 0.0025];
    const patchCoverage = 0.82;
    const boardWidth = (patchColumns * patchStep) + ((patchColumns - 1) * patchGap);
    const boardHeight = (patchRows * patchStep) + ((patchRows - 1) * patchGap);
    const boardOrigin = new THREE.Vector3(-boardWidth / 2, boardHeight / 2, 0);
    const boardNormal = new THREE.Vector3(0, 0, 1);
    const boardQuat = helpers.createQuaternionFromNormal(boardNormal);
    const splats = [];
    const hoverEntries = [];
    MACBETH_LINEAR_SRGB.forEach((patch, index) => {
      const column = index % patchColumns;
      const row = Math.floor(index / patchColumns);
      const color = new THREE.Color(...patch.linear);
      const patchX = boardOrigin.x + (column * (patchStep + patchGap));
      const patchY = boardOrigin.y - (row * (patchStep + patchGap));
      const position = new THREE.Vector3(
        patchX + (patchStep * 0.5),
        patchY - (patchStep * 0.5),
        0,
      );
      const scale = new THREE.Vector3(
        (patchStep * patchCoverage) / patchSubdivisions,
        (patchStep * patchCoverage) / patchSubdivisions,
        0.005,
      );
      const alpha = 0.6;
      const localStep = patchStep / patchSubdivisions;
      patchLayerOffsets.forEach((layerOffset) => {
        for (let subRow = 0; subRow < patchSubdivisions; subRow += 1) {
          for (let subColumn = 0; subColumn < patchSubdivisions; subColumn += 1) {
            const subPosition = new THREE.Vector3(
              patchX + ((subColumn + 0.5) * localStep),
              patchY - ((subRow + 0.5) * localStep),
              layerOffset,
            );
            splats.push({
              alpha,
              color: color.clone(),
              normal: boardNormal.clone(),
              position: subPosition,
              quaternion: boardQuat.clone(),
              scale: scale.clone(),
            });
          }
        }
      });
      hoverEntries.push({
        alpha: 1,
        color: patch.linear.slice(),
        label: patch.name,
        position: [position.x, position.y, position.z],
        scale: [patchStep * 0.5, patchStep * 0.5, 0.01],
      });
    });
    return {
      compression: "Procedural binary PLY",
      compressionRatio: "-",
      defaultSettings: {
        falloff: 1.1,
        opacity: 1,
      },
      encoding: "Runtime-authored SH0 Macbeth ColorChecker with layered patch splats (linear sRGB floats from EXR patches)",
      format: "PLY",
      localBounds: new THREE.Box3(
        new THREE.Vector3(-boardWidth / 2, -boardHeight / 2, -0.02),
        new THREE.Vector3(boardWidth / 2, boardHeight / 2, 0.02),
      ),
      name: "Primitive Macbeth",
      packedCapacity: "-",
      scaleRange: helpers.formatScaleRange(0.005, (patchStep * patchCoverage) / patchSubdivisions),
      shDegree: 0,
      source: "Generated primitive",
      hoverEntries,
      splats,
    };
  };

  const createPrimitiveDefinition = ({ kind, THREE, helpers }) => {
    if (kind === "cube") {
      return createCubePrimitive({ THREE, helpers });
    }
    if (kind === "macbeth") {
      return createMacbethPrimitive({ THREE, helpers });
    }
    return createSpherePrimitive({ THREE, helpers });
  };

  window.PrimitiveLibrary = {
    MACBETH_EXR_SOURCE_URL,
    MACBETH_LINEAR_SRGB,
    createPrimitiveDefinition,
  };
})();
