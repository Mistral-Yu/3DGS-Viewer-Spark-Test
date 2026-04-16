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
  assert.match(panel, />Load Script</);
  assert.match(panel, />Save Script</);
  assert.match(panel, />Apply Script</);
  assert.match(panel, /<textarea class="script-editor" id="animation-script-editor"[^>]*rows="24"/);
  assert.match(css, /\.script-editor\s*\{[\s\S]*min-height:\s*calc\(360px \* var\(--ui-scale\)\)/);
});
