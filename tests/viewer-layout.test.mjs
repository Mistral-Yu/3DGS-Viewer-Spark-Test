import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  computeLayoutMode,
  computePanelWidths,
  computeShellSize,
  computeUiScale,
} from '../viewer-layout.mjs';

test('computeUiScale grows only on large CSS viewports and stops at a conservative ceiling', () => {
  assert.equal(computeUiScale({ viewportHeight: 900, viewportWidth: 1440 }), 1);
  assert.equal(computeUiScale({ viewportHeight: 1080, viewportWidth: 1920 }), 1);
  assert.equal(computeUiScale({ viewportHeight: 1440, viewportWidth: 2560 }), 1.25);
  assert.equal(computeUiScale({ viewportHeight: 2160, viewportWidth: 3840 }), 1.25);
  assert.equal(MAX_UI_SCALE, 1.25);
});

test('typography is reduced independently from control and panel scaling', () => {
  const css = readFileSync(new URL('../viewer.css', import.meta.url), 'utf8');
  assert.match(css, /--type-scale:\s*0\.7/);
  assert.match(css, /font-size:\s*calc\(16px \* var\(--ui-scale\) \* var\(--type-scale\)\)/);
  assert.match(css, /--control-height:\s*calc\(32px \* var\(--ui-scale\)\)/);
  assert.match(css, /min-height:\s*var\(--control-height\)/);
  assert.match(css, /\.info-grid div[\s\S]*?background:\s*transparent/);
});

test('workbench uses one light theme and local fonts, with a separately scrolling inspector', () => {
  const css = readFileSync(new URL('../viewer.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((css.match(/:root\s*\{/g) ?? []).length, 1);
  assert.doesNotMatch(css, /@import|fonts\.googleapis/);
  assert.match(css, /--control-radius:\s*calc\(5px \* var\(--ui-scale\)\)/);
  assert.match(css, /\.inspector-panels\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.inspector-shell\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /\.header-status\.is-error\s*\{[^}]*max-height:\s*3\.9em;[^}]*overflow:\s*auto/);
  assert.match(html, /class="app-shell is-empty"/);
  assert.match(css, /\.app-shell\.is-empty \.viewer-hud,[\s\S]*?\.app-shell\.is-empty \.viewer-readout\s*\{\s*display:\s*none/);
  assert.match(html, /class="viewer-readout"[\s\S]*?id="camera-chip"/);
});

test('computeUiScale responds to viewport size instead of device pixel ratio', () => {
  const scale = computeUiScale({
    viewportHeight: 900,
    viewportWidth: 1440,
    devicePixelRatio: 3,
  });

  assert.equal(scale, computeUiScale({ viewportHeight: 900, viewportWidth: 1440, devicePixelRatio: 1 }));
});

test('alignment coordinates use the full marker row instead of competing with its remove button', () => {
  const css = readFileSync(new URL('../viewer.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /\.align-point-editors\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2/);
  assert.match(css, /\.align-point-coordinate-field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.align-point-remove-button\s*\{[^}]*grid-row:\s*1;[^}]*min-height:\s*var\(--control-height\)/);
  assert.doesNotMatch(html, /<p class="section-label">(?:Rigid Align|Sculpt Brush)<\/p>/);
});

test('computeUiScale keeps desktop controls at their authored size instead of shrinking them', () => {
  [
    { viewportHeight: 754, viewportWidth: 1200 },
    { viewportHeight: 768, viewportWidth: 1024 },
    { viewportHeight: 768, viewportWidth: 860 },
    { viewportHeight: 844, viewportWidth: 390 },
  ].forEach((viewport) => {
    assert.equal(computeUiScale(viewport), 1);
  });

  assert.equal(MIN_UI_SCALE, 1);
});

test('computeUiScale clamps invalid measurements to full scale', () => {
  assert.equal(computeUiScale({ viewportHeight: 0, viewportWidth: 0 }), 1);
});

test('computeLayoutMode keeps a 1200px viewport in wide mode so the inspector does not wrap below', () => {
  assert.equal(computeLayoutMode({ viewportWidth: 1200 }), 'wide');
});

test('computeLayoutMode keeps the established 1024, 860, and 390px responsive layouts', () => {
  assert.equal(computeLayoutMode({ viewportWidth: 1024 }), 'compact');
  assert.equal(computeLayoutMode({ viewportWidth: 860 }), 'stacked');
  assert.equal(computeLayoutMode({ viewportWidth: 390 }), 'stacked');
});

test('computeShellSize fills the viewport minus outer padding on large screens', () => {
  assert.deepEqual(
    computeShellSize({ viewportWidth: 3840, viewportHeight: 2160 }),
    { width: 3808, height: 2128 },
  );
});

test('computePanelWidths expands side panels modestly on large screens without leaving outer margins', () => {
  assert.deepEqual(
    computePanelWidths({ layoutMode: 'wide', uiScale: 1.25, viewportWidth: 3840 }),
    { left: 375, right: 525 },
  );
  assert.deepEqual(
    computePanelWidths({ layoutMode: 'wide', uiScale: 1, viewportWidth: 3840 }),
    { left: 300, right: 420 },
  );
});
