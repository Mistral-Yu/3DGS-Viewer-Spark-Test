const TONE_CURVE_CHANNELS = ['master', 'red', 'green', 'blue'];
const MIN_POINT_GAP = 0.001;
const DEFAULT_CHANNEL = 'master';

const clamp01 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(Math.max(parsed, 0), 1);
};

const sanitizeChannel = (channel) => (TONE_CURVE_CHANNELS.includes(channel) ? channel : DEFAULT_CHANNEL);

const clonePoint = (point) => ({ x: clamp01(point?.x), y: clamp01(point?.y) });

const sortPoints = (points) => [...points]
  .map(clonePoint)
  .sort((left, right) => left.x - right.x);

const normalizeCurvePoints = (points) => {
  const source = Array.isArray(points) && points.length >= 2
    ? sortPoints(points)
    : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const normalized = source.map((point, index) => {
    if (index === 0) {
      return { x: 0, y: 0 };
    }
    if (index === source.length - 1) {
      return { x: 1, y: 1 };
    }
    const previous = source[index - 1];
    const next = source[index + 1];
    return {
      x: Math.min(Math.max(point.x, previous.x + MIN_POINT_GAP), next.x - MIN_POINT_GAP),
      y: clamp01(point.y),
    };
  });
  normalized[0] = { x: 0, y: 0 };
  normalized[normalized.length - 1] = { x: 1, y: 1 };
  return normalized;
};

const buildIdentityCurve = () => [{ x: 0, y: 0 }, { x: 1, y: 1 }];

const cloneCurveMap = (curves = {}) => Object.fromEntries(
  TONE_CURVE_CHANNELS.map((channel) => [channel, normalizeCurvePoints(curves[channel])]),
);

const cloneSelectionMap = (selectedPointIndices = {}, curves) => Object.fromEntries(
  TONE_CURVE_CHANNELS.map((channel) => {
    const index = Number(selectedPointIndices[channel]);
    const maxIndex = Math.max((curves[channel]?.length || 2) - 1, 1);
    return [channel, Number.isInteger(index) ? Math.min(Math.max(index, 0), maxIndex) : maxIndex];
  }),
);

export function buildToneCurveState() {
  const curves = Object.fromEntries(TONE_CURVE_CHANNELS.map((channel) => [channel, buildIdentityCurve()]));
  return {
    activeChannel: DEFAULT_CHANNEL,
    curves,
    selectedPointIndices: Object.fromEntries(TONE_CURVE_CHANNELS.map((channel) => [channel, 1])),
  };
}

export function normalizeToneCurveState(state) {
  const curves = cloneCurveMap(state?.curves);
  return {
    activeChannel: sanitizeChannel(state?.activeChannel),
    curves,
    selectedPointIndices: cloneSelectionMap(state?.selectedPointIndices, curves),
  };
}

export function setToneCurveActiveChannel(state, channel) {
  const normalized = normalizeToneCurveState(state);
  return {
    ...normalized,
    activeChannel: sanitizeChannel(channel),
  };
}

export function setToneCurveSelectedPoint(state, channel, index) {
  const normalized = normalizeToneCurveState(state);
  const safeChannel = sanitizeChannel(channel);
  const maxIndex = normalized.curves[safeChannel].length - 1;
  return {
    ...normalized,
    selectedPointIndices: {
      ...normalized.selectedPointIndices,
      [safeChannel]: Math.min(Math.max(Number(index) || 0, 0), maxIndex),
    },
  };
}

export function getSelectedToneCurvePoint(state, channel = null) {
  const normalized = normalizeToneCurveState(state);
  const safeChannel = sanitizeChannel(channel ?? normalized.activeChannel);
  const index = normalized.selectedPointIndices[safeChannel];
  return normalized.curves[safeChannel][index] ?? normalized.curves[safeChannel].at(-1);
}

export function sampleToneCurveChannel(points, value) {
  const curve = normalizeCurvePoints(points);
  const x = clamp01(value);
  let y = curve[0].y;
  for (let index = 0; index < curve.length - 1; index += 1) {
    const start = curve[index];
    const end = curve[index + 1];
    const span = Math.max(end.x - start.x, MIN_POINT_GAP);
    const local = Math.min(Math.max(x - start.x, 0), span);
    y += ((end.y - start.y) / span) * local;
  }
  return clamp01(y);
}

export function insertToneCurvePoint(state, channel = null, point = {}) {
  const normalized = normalizeToneCurveState(state);
  const safeChannel = sanitizeChannel(channel ?? normalized.activeChannel);
  const currentCurve = normalized.curves[safeChannel];
  const x = clamp01(point.x ?? 0.5);
  const nextPoint = {
    x,
    y: clamp01(point.y ?? sampleToneCurveChannel(currentCurve, x)),
  };
  const curves = {
    ...normalized.curves,
    [safeChannel]: normalizeCurvePoints([...currentCurve, nextPoint]),
  };
  const insertedIndex = curves[safeChannel].findIndex((candidate) =>
    Math.abs(candidate.x - nextPoint.x) < 1e-6 && Math.abs(candidate.y - nextPoint.y) < 1e-6,
  );
  return {
    ...normalized,
    activeChannel: safeChannel,
    curves,
    selectedPointIndices: {
      ...normalized.selectedPointIndices,
      [safeChannel]: insertedIndex >= 0 ? insertedIndex : curves[safeChannel].length - 2,
    },
  };
}

export function updateToneCurvePoint(state, channel = null, index = 0, updates = {}) {
  const normalized = normalizeToneCurveState(state);
  const safeChannel = sanitizeChannel(channel ?? normalized.activeChannel);
  const curve = normalized.curves[safeChannel].map(clonePoint);
  if (index <= 0 || index >= curve.length - 1) {
    return normalized;
  }
  const previous = curve[index - 1];
  const next = curve[index + 1];
  curve[index] = {
    x: Math.min(Math.max(clamp01(updates.x ?? curve[index].x), previous.x + MIN_POINT_GAP), next.x - MIN_POINT_GAP),
    y: clamp01(updates.y ?? curve[index].y),
  };
  return {
    ...normalized,
    curves: {
      ...normalized.curves,
      [safeChannel]: normalizeCurvePoints(curve),
    },
  };
}

export function removeToneCurvePoint(state, channel = null, index = null) {
  const normalized = normalizeToneCurveState(state);
  const safeChannel = sanitizeChannel(channel ?? normalized.activeChannel);
  const curve = normalized.curves[safeChannel];
  const targetIndex = index == null ? normalized.selectedPointIndices[safeChannel] : Number(index);
  if (targetIndex <= 0 || targetIndex >= curve.length - 1) {
    return normalized;
  }
  const nextCurve = curve.filter((_, pointIndex) => pointIndex !== targetIndex);
  return {
    ...normalized,
    curves: {
      ...normalized.curves,
      [safeChannel]: nextCurve,
    },
    selectedPointIndices: {
      ...normalized.selectedPointIndices,
      [safeChannel]: Math.min(targetIndex, nextCurve.length - 1),
    },
  };
}

export function isNeutralToneCurve(state) {
  const normalized = normalizeToneCurveState(state);
  return TONE_CURVE_CHANNELS.every((channel) => {
    const curve = normalized.curves[channel];
    return curve.length === 2
      && Math.abs(curve[0].x) < 1e-6
      && Math.abs(curve[0].y) < 1e-6
      && Math.abs(curve[1].x - 1) < 1e-6
      && Math.abs(curve[1].y - 1) < 1e-6;
  });
}

export function applyToneCurveToLinearRgb(linearRgb, state) {
  const normalized = normalizeToneCurveState(state);
  const [r = 0, g = 0, b = 0] = Array.isArray(linearRgb) ? linearRgb : [0, 0, 0];
  const masterCurve = normalized.curves.master;
  const applyChannel = (value, channel) => sampleToneCurveChannel(normalized.curves[channel], sampleToneCurveChannel(masterCurve, value));
  return [
    applyChannel(r, 'red'),
    applyChannel(g, 'green'),
    applyChannel(b, 'blue'),
  ];
}

export function summarizeToneCurve(state) {
  const normalized = normalizeToneCurveState(state);
  return TONE_CURVE_CHANNELS.map((channel) => `${channel[0].toUpperCase()}:${normalized.curves[channel].length}`).join(' ');
}

export { MIN_POINT_GAP, TONE_CURVE_CHANNELS };
