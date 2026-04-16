export const DESIGN_WIDTH = 1888;
export const DESIGN_HEIGHT = 1048;
export const VIEWPORT_PADDING = 16;
export const MIN_UI_SCALE = 0.6;
export const MAX_UI_SCALE = 1;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function computeUiScale({
  viewportWidth,
  viewportHeight,
  padding = VIEWPORT_PADDING,
  minScale = MIN_UI_SCALE,
  maxScale = MAX_UI_SCALE,
} = {}) {
  const usableWidth = Number(viewportWidth) - (padding * 2);
  const usableHeight = Number(viewportHeight) - (padding * 2);
  if (!Number.isFinite(usableWidth) || !Number.isFinite(usableHeight) || usableWidth <= 0 || usableHeight <= 0) {
    return 1;
  }
  const widthScale = usableWidth / DESIGN_WIDTH;
  const heightScale = usableHeight / DESIGN_HEIGHT;
  return Number(clamp(Math.min(widthScale, heightScale, maxScale), minScale, maxScale).toFixed(4));
}
