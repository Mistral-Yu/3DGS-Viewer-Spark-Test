import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../viewer.js', import.meta.url), 'utf8');
const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the file chooser and drop affordance describe additive multi-file splat loading', () => {
  assert.match(markup, /id="file-input" type="file" accept="\.ply,\.spz,\.splat,\.ksplat" multiple hidden/);
  assert.match(markup, /id="drop-overlay-message">Drop supported splat files to add them to the scene\. Existing splats stay\./);
  assert.match(markup, /drop supported splat files to add them to the scene/i);
});

test('supported dropped files load sequentially without clearing the current scene', () => {
  const batchLoader = source.match(/async loadFromFiles\(files\) \{[\s\S]*?\n      \}\n\n      async loadFromUrl/)?.[0] ?? '';

  assert.match(batchLoader, /const supportedFiles = droppedFiles\.filter\(\(file\) => isSupportedFile\(file\)\);/);
  assert.match(batchLoader, /for \(const file of supportedFiles\) \{[\s\S]*?await this\.loadFromFile\(file\)/);
  assert.match(batchLoader, /Existing scene was kept\./);
  assert.match(batchLoader, /Ignored \$\{rejectedCount\} unsupported file/);
  assert.match(batchLoader, /const failedCount = supportedFiles\.length - addedCount;/);
  assert.match(batchLoader, /supported file\$\{failedCount === 1 \? "" : "s"\} could not be added\./);
  assert.doesNotMatch(batchLoader, /clearScene\(|clearLoadedSplat\(/);
  assert.match(source, /async onDrop\(event\) \{[\s\S]*?await this\.loadFromFiles\(event\.dataTransfer\?\.files\);/);
});

test('drop handling keeps navigation outside the stage inert and restores the empty affordance after an initial read or decode failure', () => {
  assert.match(source, /preventExternalFileDrop = \(event\) => \{[\s\S]*?Array\.from\(event\.dataTransfer\?\.types \|\| \[\]\)\.includes\("Files"\)[\s\S]*?!this\.dom\.stage\.contains\(event\.target\)[\s\S]*?event\.preventDefault\(\)/);
  assert.match(source, /document\.addEventListener\("dragover", this\.preventExternalFileDrop\);/);
  assert.match(source, /document\.addEventListener\("drop", this\.preventExternalFileDrop\);/);
  assert.match(source, /async loadFromFile\(file\) \{[\s\S]*?try \{[\s\S]*?await file\.arrayBuffer\(\)[\s\S]*?catch \(error\) \{[\s\S]*?Could not read \$\{file\.name\}/);
  assert.match(source, /async loadMesh\(\{[\s\S]*?catch \(error\) \{[\s\S]*?if \(!this\.sceneItems\.length\) \{[\s\S]*?this\.showEmptyState\(\);/);
});

test('each added file selects its new item and refreshes the active backend snapshot', () => {
  const meshLoader = source.match(/async loadMesh\(\{[\s\S]*?\n      \}\n\n      attachMesh/)?.[0] ?? '';

  assert.match(meshLoader, /this\.sceneItems\.push\(sceneItem\);[\s\S]*?this\.selectedSceneItemId = sceneItem\.id;/);
  assert.match(meshLoader, /this\.syncSelectionRefs\(sceneItem\);[\s\S]*?this\.syncAnimationControls\(true\);/);
  assert.match(meshLoader, /this\.syncSceneList\(\);[\s\S]*?this\.refreshActiveBackendSnapshot\("Splat loaded"\);/);
  assert.match(meshLoader, /this\.schedulePostLoadRefresh\(\);[\s\S]*?return true;/);
});

test('display-density changes resync renderer pixels without changing the UI scale', () => {
  assert.match(source, /window\.matchMedia\?\.\(`\(resolution: \$\{window\.devicePixelRatio \|\| 1\}dppx\)`\)/);
  assert.match(source, /handleViewportResize = \(\) => \{[\s\S]*?this\.syncUiScale\(\);[\s\S]*?this\.syncRendererPixelRatio\(\);/);
  assert.match(source, /syncRendererPixelRatio\(\) \{[\s\S]*?Math\.min\(window\.devicePixelRatio \|\| 1, preset\.maxPixelRatio\)/);
});
