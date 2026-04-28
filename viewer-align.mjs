const EPSILON = 1e-8;

function toPoint(point) {
  return {
    x: Number(point?.x ?? 0),
    y: Number(point?.y ?? 0),
    z: Number(point?.z ?? 0),
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(point, scalar) {
  return { x: point.x * scalar, y: point.y * scalar, z: point.z * scalar };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(point) {
  return Math.hypot(point.x, point.y, point.z);
}

function normalize(point) {
  const magnitude = length(point);
  if (magnitude <= EPSILON) {
    throw new Error("Alignment points must include 3 non-collinear points.");
  }
  return scale(point, 1 / magnitude);
}

function makeBasis(points, indices) {
  const p0 = toPoint(points[indices[0]]);
  const p1 = toPoint(points[indices[1]]);
  const p2 = toPoint(points[indices[2]]);
  const xRaw = sub(p1, p0);
  const yRaw = sub(p2, p0);
  const xAxis = normalize(xRaw);
  const normal = normalize(cross(xRaw, yRaw));
  const yAxis = normalize(cross(normal, xAxis));
  const xLength = length(xRaw);
  const yProjection = dot(yRaw, yAxis);
  const scaleHint = (xLength + Math.abs(yProjection)) / 2;
  return { origin: p0, axes: [xAxis, yAxis, normal], scaleHint };
}

function findStableTriad(sourcePoints, targetPoints) {
  const count = Math.min(sourcePoints.length, targetPoints.length);
  for (let i = 0; i < count - 2; i += 1) {
    for (let j = i + 1; j < count - 1; j += 1) {
      for (let k = j + 1; k < count; k += 1) {
        try {
          makeBasis(sourcePoints, [i, j, k]);
          makeBasis(targetPoints, [i, j, k]);
          return [i, j, k];
        } catch (_error) {
          // Try the next corresponding triad.
        }
      }
    }
  }
  throw new Error("Alignment points must include 3 non-collinear matching pairs.");
}

function buildRotationMatrix(sourceAxes, targetAxes) {
  const sx = sourceAxes[0];
  const sy = sourceAxes[1];
  const sz = sourceAxes[2];
  const tx = targetAxes[0];
  const ty = targetAxes[1];
  const tz = targetAxes[2];
  return [
    [tx.x * sx.x + ty.x * sy.x + tz.x * sz.x, tx.x * sx.y + ty.x * sy.y + tz.x * sz.y, tx.x * sx.z + ty.x * sy.z + tz.x * sz.z],
    [tx.y * sx.x + ty.y * sy.x + tz.y * sz.x, tx.y * sx.y + ty.y * sy.y + tz.y * sz.y, tx.y * sx.z + ty.y * sy.z + tz.y * sz.z],
    [tx.z * sx.x + ty.z * sy.x + tz.z * sz.x, tx.z * sx.y + ty.z * sy.y + tz.z * sz.y, tx.z * sx.z + ty.z * sy.z + tz.z * sz.z],
  ];
}

function rotatePoint(point, matrix) {
  return {
    x: matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2] * point.z,
    y: matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2] * point.z,
    z: matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2] * point.z,
  };
}

function matrixToQuaternion(matrix) {
  const m11 = matrix[0][0];
  const m12 = matrix[0][1];
  const m13 = matrix[0][2];
  const m21 = matrix[1][0];
  const m22 = matrix[1][1];
  const m23 = matrix[1][2];
  const m31 = matrix[2][0];
  const m32 = matrix[2][1];
  const m33 = matrix[2][2];
  const trace = m11 + m22 + m33;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }
  return { x, y, z, w };
}

export function buildAlignmentPairs({ sourcePoints, targetPoints }) {
  const count = Math.min(sourcePoints?.length ?? 0, targetPoints?.length ?? 0);
  return Array.from({ length: count }, (_unused, offset) => ({
    index: offset + 1,
    source: toPoint(sourcePoints[offset]),
    target: toPoint(targetPoints[offset]),
  }));
}

export function computeRigidAlignment({ sourcePoints, targetPoints }) {
  if (!Array.isArray(sourcePoints) || !Array.isArray(targetPoints)) {
    throw new Error("Alignment requires sourcePoints and targetPoints arrays.");
  }
  const pairs = buildAlignmentPairs({ sourcePoints, targetPoints });
  if (pairs.length < 3) {
    throw new Error("Alignment requires at least 3 matching point pairs.");
  }
  const source = pairs.map((pair) => pair.source);
  const target = pairs.map((pair) => pair.target);
  const triad = findStableTriad(source, target);
  const sourceBasis = makeBasis(source, triad);
  const targetBasis = makeBasis(target, triad);
  if (sourceBasis.scaleHint <= EPSILON || targetBasis.scaleHint <= EPSILON) {
    throw new Error("Alignment points must include 3 non-collinear matching pairs.");
  }
  const uniformScale = targetBasis.scaleHint / sourceBasis.scaleHint;
  const rotation = buildRotationMatrix(sourceBasis.axes, targetBasis.axes);
  const translation = sub(targetBasis.origin, scale(rotatePoint(sourceBasis.origin, rotation), uniformScale));
  return {
    scale: uniformScale,
    rotation,
    quaternion: matrixToQuaternion(rotation),
    translation,
    pairCount: pairs.length,
    triad: triad.map((index) => index + 1),
  };
}

export function applySimilarityTransform(point, transform) {
  return add(scale(rotatePoint(toPoint(point), transform.rotation), transform.scale), transform.translation);
}

export function formatAlignPointLabel({ role, index }) {
  const prefix = role === "target" ? "T" : "S";
  return `${prefix}${Number(index) || 1}`;
}
