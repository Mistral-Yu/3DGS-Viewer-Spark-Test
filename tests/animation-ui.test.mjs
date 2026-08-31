import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../viewer.css', import.meta.url), 'utf8');
const source = await readFile(new URL('../viewer.js', import.meta.url), 'utf8');

test('timeline is collapsed by default and keeps playback controls inside its semantic content region', () => {
  const timelineMatch = html.match(/<section class="timeline-panel"[\s\S]*?<\/section>/);
  assert.ok(timelineMatch, 'timeline section should exist');
  const timeline = timelineMatch[0];

  assert.match(timeline, /id="timeline-toggle-button"[^>]*aria-expanded="false"[^>]*aria-controls="timeline-content"/);
  const contentMatch = timeline.match(/<div id="timeline-content" hidden>[\s\S]*?<\/div>/);
  assert.ok(contentMatch, 'timeline content should be hidden by default');
  assert.match(css, /#timeline-content\[hidden\]\s*\{\s*display:\s*none;/);
  const content = contentMatch[0];

  const toolbarGroupMatch = content.match(/<div class="button-pair button-pair-timeline"[\s\S]*?<\/div>/);
  assert.ok(toolbarGroupMatch, 'timeline playback group should exist');

  const toolbarGroup = toolbarGroupMatch[0];
  assert.match(toolbarGroup, /id="animation-play-button"/);
  assert.match(toolbarGroup, /id="animation-pause-button"/);
  assert.match(toolbarGroup, /id="animation-reset-button"/);
  assert.doesNotMatch(content, /id="animation-apply-button"/);
  assert.match(timeline, /id="animation-time-range"[^>]*aria-label="Animation time"/);
  assert.match(
    css,
    /\.button-pair\.button-pair-timeline\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
  );
});

test('animation tab keeps preset load beside preset and script actions in the panel', () => {
  const animationMatch = html.match(/<section class="inspector-panel" id="inspector-animation"[\s\S]*?<\/section>/);
  assert.ok(animationMatch, 'animation panel should exist');
  const panel = animationMatch[0];

  assert.match(panel, /id="animation-preset-select"[\s\S]*id="animation-load-preset-button"/);
  assert.match(panel, /<label for="animation-preset-select">Preset<\/label>/);
  assert.doesNotMatch(panel, /<label[^>]*>\s*<span>Preset<\/span>\s*<div class="field-inline field-inline-actions">/);
  assert.match(panel, /value="explosion" selected/);
  assert.doesNotMatch(panel, /value="reveal"/);
  assert.match(panel, /id="animation-origin-mode-select"/);
  assert.match(panel, /id="animation-origin-x-input"/);
  assert.match(panel, /id="animation-origin-y-input"/);
  assert.match(panel, /id="animation-origin-z-input"/);
  assert.match(panel, />Load Script</);
  assert.match(panel, />Save Script</);
  assert.match(panel, />Apply to Selected</);
  assert.match(panel, />Clear Script</);
  assert.match(panel, /<textarea class="script-editor" id="animation-script-editor"[^>]*rows="16"/);
  assert.match(css, /\.script-editor\s*\{[\s\S]*min-height:\s*calc\(240px \* var\(--ui-scale\)\)/);
});

test('Auto LoD controls and presentation are absent', () => {
  assert.doesNotMatch(html, /auto.?lod|lod-auto-checkbox|lod-chip|info-auto-lod|info-load-mode/i);
  assert.doesNotMatch(css, /hud-chip-lod|auto.?lod/i);
});

test('inspector tabs stay pinned to a compact multi-row grid', () => {
  const tabsMatch = html.match(/<div class="inspector-tabs" role="tablist" aria-label="Inspector tabs">[\s\S]*?<\/div>/);
  assert.ok(tabsMatch, 'inspector tablist should exist');
  assert.match(tabsMatch[0], /id="tab-scene-button"/);
  assert.match(tabsMatch[0], /id="tab-align-button"/);
  assert.match(tabsMatch[0], /id="tab-brush-button"/);
  assert.match(tabsMatch[0], /id="tab-export-button"/);
  assert.match(tabsMatch[0], /id="tab-animation-button"[^>]*>Animate<\/button>/);
  assert.equal((tabsMatch[0].match(/data-inspector-tab=/g) || []).length, 8);
  assert.match(css, /\.inspector-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.inspector-tabs \.segmented-button\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(css, /\.scene-item-button\[aria-pressed="true"\]\s*\{[\s\S]*background:\s*#eaf2ff;/);
  assert.doesNotMatch(css, /\.inspector-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/);
});

test('brush tab exposes move, standard, and scale splat sculpt controls', () => {
  const brushMatch = html.match(/<section class="inspector-panel" id="inspector-brush"[\s\S]*?<\/section>/);
  assert.ok(brushMatch, 'brush panel should exist');
  const panel = brushMatch[0];

  assert.match(panel, /id="brush-toggle-button"/);
  assert.match(panel, /id="brush-undo-button"/);
  assert.match(panel, /id="brush-reset-button"/);
  assert.match(panel, /id="brush-mode-select"[\s\S]*value="move" selected[\s\S]*value="standard"[\s\S]*value="scale"/);
  assert.match(panel, /id="brush-radius-range"/);
  assert.match(panel, /id="brush-depth-range"[\s\S]*Relative Strength[\s\S]*id="brush-strength-range"/);
  assert.match(panel, /id="brush-strength-range"[^>]*min="-2"[^>]*max="2"/);
  assert.match(panel, /Relative Strength/);
  assert.match(panel, /Strength follows Gaussian size/);
  assert.match(panel, /id="brush-relative-checkbox"/);
  assert.match(panel, /id="brush-depth-range"/);
  assert.match(panel, /id="brush-scale-range"/);
  assert.match(panel, /id="brush-undo-limit-range"/);
  assert.match(css, /\.viewer-stage\.is-brushing/);
  assert.match(css, /\.checkbox-row/);
});

test('inspector sections omit duplicated tab headings', () => {
  const inspectorMatch = html.match(/<section class="panel-section inspector-shell">[\s\S]*?<\/section>/);
  assert.ok(inspectorMatch, 'inspector shell should exist');
  const inspector = inspectorMatch[0];

  assert.doesNotMatch(inspector, /<h2>Splats \/ Color \/ Light \/ Animation \/ Info \/ Export<\/h2>/);
  assert.doesNotMatch(inspector, /<h2>/);
});

test('color tab exposes point-based linear-srgb tone curve controls', () => {
  const colorMatch = html.match(/<section class="inspector-panel" id="inspector-color"[\s\S]*?<\/section>/);
  assert.ok(colorMatch, 'color panel should exist');
  const panel = colorMatch[0];

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

test('color tab exposes load-and-apply LUT controls with explicit color-space conversion choices', () => {
  const colorMatch = html.match(/<section class="inspector-panel" id="inspector-color"[\s\S]*?<\/section>/);
  assert.ok(colorMatch, 'color panel should exist');
  const panel = colorMatch[0];

  assert.match(panel, /id="lut-open-button"/);
  assert.match(panel, /id="lut-file-input"/);
  assert.match(panel, /id="lut-input-color-space-select"/);
  assert.match(panel, /id="lut-output-color-space-select"/);
  assert.match(panel, /id="lut-apply-selected-button"/);
  assert.match(panel, /value="linear-srgb"/);
  assert.match(panel, /value="srgb"/);
  assert.match(panel, /value="gamma22"/);
  assert.match(panel, /id="lut-status"[^>]*>No LUT loaded\.<\/p>/);
});

test('animation copy explains selected-item and target-local coordinates', () => {
  const animationMatch = html.match(/<section class="inspector-panel" id="inspector-animation"[\s\S]*?<\/section>/);
  assert.ok(animationMatch, 'animation panel should exist');
  const panel = animationMatch[0];

  assert.match(panel, /Apply to Selected/);
  assert.match(panel, /target-local/);
});

test('focal length starts at one shared 28 mm default before and after initialization', () => {
  assert.match(html, /id="focal-length-range"[^>]*value="142"/);
  assert.match(html, /id="focal-length-input"[^>]*value="28"/);
  assert.match(html, /id="lens-chip">28 mm</);
  assert.match(source, /const DEFAULT_FOCAL_LENGTH = 28;/);
  assert.match(source, /focalLength: DEFAULT_FOCAL_LENGTH,/);
  assert.match(source, /this\.camera\.setFocalLength\(focalLength\);/);
});

test('cleanup keeps the focused open, list, and selected-item flows without duplicate chrome', () => {
  const leftPanel = html.match(/<aside class="panel panel-left">([\s\S]*?)<\/aside>/)?.[1] ?? '';
  const scenePanel = html.match(/<section class="inspector-panel is-active" id="inspector-scene"[\s\S]*?<\/section>/)?.[0] ?? '';

  assert.equal((html.match(/>\s*Open File\s*</g) ?? []).length, 1);
  assert.match(html, /id="header-open-file-button"[\s\S]*?hidden/);
  assert.doesNotMatch(leftPanel, /id="open-file-button"/);
  assert.match(source, /syncOpenFileAction\(\)[\s\S]*?textContent = "Add File"/);
  assert.match(source, /const hasClearableContent = hasSceneItems \|\| this\.sceneLights\.length > 0;/);
  assert.match(source, /this\.dom\.clearSceneButton\.disabled = !hasClearableContent;/);
  assert.match(source, /syncLightList\(\) \{[\s\S]*?this\.syncOpenFileAction\(\);/);
  assert.doesNotMatch(leftPanel, /<p class="section-label">(?:Workspace|Navigation|Actions)<\/p>/);
  assert.match(leftPanel, /<h2>Camera<\/h2>/);
  assert.match(leftPanel, /<h2>Scene<\/h2>/);
  assert.match(leftPanel, /<details class="options-disclosure">[\s\S]*?<summary>Navigation options<\/summary>/);
  assert.match(leftPanel, /class="primitive-actions"[\s\S]*id="primitive-select"[\s\S]*id="add-primitive-button"/);
  assert.match(leftPanel, /id="add-primitive-button"[^>]*>Add<\/button>/);
  assert.match(leftPanel, /class="overlay-controls"[\s\S]*id="toggle-grid-button"[\s\S]*id="toggle-axes-button"[\s\S]*id="toggle-bounds-button"/);
  assert.match(scenePanel, /id="scene-list"[\s\S]*?<summary>List options<\/summary>/);
  assert.match(scenePanel, /id="scene-render-section" hidden/);
  assert.match(scenePanel, /id="scene-transform-section" hidden/);
  assert.match(source, /section\.hidden = !item;/);
  assert.match(css, /\*\[hidden\]\s*\{\s*display:\s*none !important;/);
});

test('keyboard, confirmation, tab, action naming, and stacked viewport regressions stay accessible', () => {
  assert.doesNotMatch(source, /renderModeSelect\.addEventListener\("keydown"/);
  assert.match(source, /isEditableKeyboardTarget\(event\.target\)/);
  assert.match(source, /target\.closest\("input, select, textarea, \[contenteditable\]/);
  assert.match(source, /confirmClearScene\(\)[\s\S]*?window\.confirm\(`Clear Scene\?\\n\\nRemove \$\{splatLabel\} and \$\{lightLabel\}\.`\)/);
  assert.match(source, /handleInspectorTabKeydown\(event\)[\s\S]*?ArrowLeft[\s\S]*?ArrowRight[\s\S]*?Home[\s\S]*?End/);
  assert.match(source, /button\.tabIndex = isActive \? 0 : -1;/);
  assert.match(html, /id="tab-scene-button"[\s\S]*?aria-controls="inspector-scene"[\s\S]*?tabindex="0"/);
  assert.match(html, /id="inspector-scene"[\s\S]*?aria-labelledby="tab-scene-button"/);
  assert.match(source, /aria-label", `\$\{item\.visible \? "Hide" : "Show"\} splat \$\{item\.modelMeta\.name\}`/);
  assert.match(source, /aria-label", `\$\{light\.visible \? "Hide" : "Show"\} light \$\{light\.name\}`/);
  assert.match(source, /aria-label", `\$\{item\.exportEnabled \? "Exclude" : "Include"\} \$\{item\.modelMeta\.name\} from export`/);
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 860px\)[\s\S]*?body\[data-layout="stacked"\] \.viewer-stage[\s\S]*?min-height: 44vh/);
  assert.match(css, /body\[data-layout="stacked"\] \.viewer-panel\s*{\s*order:\s*-1;/);
  assert.match(css, /body\[data-layout="stacked"\] \.toolbar-button[\s\S]*?min-height: 44px/);
  assert.match(css, /body\[data-layout="stacked"\] \.scene-item-main[\s\S]*?min-height: 44px/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.header-status[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
});

test('timeline context stays visible and default-visible helpers stay concise', () => {
  assert.doesNotMatch(css, /\.app-shell:not\(\.is-empty\) \.timeline-empty-note\s*\{\s*display:\s*none;/);
  assert.match(html, /class="timeline-empty-note"[^>]*>Select a splat to animate\.<\/p>/);
  assert.match(html, /Point curve in linear sRGB\. Master runs before RGB channels\./);
  assert.match(html, /Bake direct light into SH0\. One visible point light required\./);
  const leftPanel = html.match(/<aside class="panel panel-left">([\s\S]*?)<\/aside>/)?.[1] ?? '';
  assert.doesNotMatch(leftPanel, /class="hint-badge"/);
  assert.doesNotMatch(source, /modeDescription/);
});

test('long failures wrap without breaking the header and collapsed playback remains visible', () => {
  assert.match(css, /\.header-status\.is-error\s*{[^}]*max-height:\s*3\.9em;[^}]*overflow:\s*auto;[^}]*white-space:\s*normal;/s);
  assert.match(source, /statusLine\.classList\.toggle\("is-error", \/\(\?:error\|failed\|unavailable\)\/i\.test\(message\)\)/);
  assert.match(source, /const visibleAction = !expanded && this\.state\.animationPlaying \? "Playing · Show" : action;/);
  assert.match(css, /\.toolbar-button\.toolbar-button-primary:disabled\s*{[^}]*background:\s*#e9eff7;[^}]*color:\s*#52657d;[^}]*opacity:\s*1;/s);
});
