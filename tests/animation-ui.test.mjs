import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../viewer.css', import.meta.url), 'utf8');

test('timeline keeps only playback buttons in a single toolbar group', () => {
  const timelineMatch = html.match(/<section class="timeline-panel"[\s\S]*?<\/section>/);
  assert.ok(timelineMatch, 'timeline section should exist');
  const timeline = timelineMatch[0];

  const toolbarGroupMatch = timeline.match(/<div class="button-pair button-pair-timeline"[\s\S]*?<\/div>/);
  assert.ok(toolbarGroupMatch, 'timeline playback group should exist');

  const toolbarGroup = toolbarGroupMatch[0];
  assert.match(toolbarGroup, /id="animation-play-button"/);
  assert.match(toolbarGroup, /id="animation-pause-button"/);
  assert.match(toolbarGroup, /id="animation-reset-button"/);
  assert.doesNotMatch(timeline, /id="animation-apply-button"/);
  assert.match(css, /\.button-pair-timeline\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('animation tab keeps preset load beside preset and script actions in the panel', () => {
  const animationMatch = html.match(/<section class="inspector-panel" id="inspector-animation"[\s\S]*?<\/section>/);
  assert.ok(animationMatch, 'animation panel should exist');
  const panel = animationMatch[0];

  assert.match(panel, /id="animation-preset-select"[\s\S]*id="animation-load-preset-button"/);
  assert.match(panel, /value="explosion"/);
  assert.match(panel, /value="reveal"/);
  assert.match(panel, /id="animation-origin-mode-select"/);
  assert.match(panel, /id="animation-origin-x-input"/);
  assert.match(panel, /id="animation-origin-y-input"/);
  assert.match(panel, /id="animation-origin-z-input"/);
  assert.match(panel, />Load Script</);
  assert.match(panel, />Save Script</);
  assert.match(panel, />Apply Script</);
  assert.match(panel, /<textarea class="script-editor" id="animation-script-editor"[^>]*rows="24"/);
  assert.match(css, /\.script-editor\s*\{[\s\S]*min-height:\s*calc\(360px \* var\(--ui-scale\)\)/);
});

test('open file actions expose the auto-lod toggle beside file loading and viewer hud chip', () => {
  const helpersMatch = html.match(/<section class="panel-section">[\s\S]*?id="open-file-button"[\s\S]*?<\/section>/);
  assert.ok(helpersMatch, 'helpers section should exist');
  const helpers = helpersMatch[0];

  assert.match(helpers, /id="open-file-button"[\s\S]*id="lod-auto-checkbox"/);
  assert.match(helpers, /<input id="lod-auto-checkbox" type="checkbox" checked>/);
  assert.match(html, /id="lod-chip"/);
  assert.match(css, /\.hud-chip-lod/);
});

test('color tab exposes point-based linear-srgb tone curve controls', () => {
  const colorMatch = html.match(/<section class="inspector-panel" id="inspector-color"[\s\S]*?<\/section>/);
  assert.ok(colorMatch, 'color panel should exist');
  const panel = colorMatch[0];

  assert.match(panel, />Tone Curve</);
  assert.match(panel, /id="tone-curve-channel-select"/);
  assert.match(panel, /id="tone-curve-graph"/);
  assert.match(panel, /id="tone-curve-add-point-button"/);
  assert.match(panel, /id="tone-curve-remove-point-button"/);
  assert.match(panel, /id="tone-curve-point-x-input"/);
  assert.match(panel, /id="tone-curve-point-y-input"/);
  assert.match(panel, /linear sRGB/);
  assert.match(css, /\.tone-curve-graph/);
  assert.match(css, /\.tone-curve-point-list/);
});
