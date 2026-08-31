# Spatial LookDev Lab

Static 3D Gaussian Splatting look-development tool with selectable Spark 2.0,
PlayCanvas 2.21.2, and Three.js r186dev render backends. The repository
directory remains `3DGS-Viewer-Spark-Test` for its existing GitHub Pages URL.

This project is intended as a place to test 3DGS linear workflow behavior, color grading, Lighting and related look-development workflows.
There are currently very few web-based tools that focus on this kind of testing.

This repository is kept intentionally small for GitHub Pages. Large sample models are not stored here, but the viewer includes procedural Sphere, Cube, Macbeth, Human, Bunny, and Dragon splat samples for immediate testing.

## Included

- `index.html`
- `viewer.js`
- `viewer.bundle.js`
- `viewer-vendor-playcanvas.bundle.js`
- `viewer-vendor-three-r186.bundle.js`
- `viewer.css`
- `primitives/`
- `vendor/`
- build metadata: `package.json`, `package-lock.json`

## Not included

- large splat datasets
- local scratch files
- browser automation artifacts

## Usage

### GitHub Pages

Live demo: https://mistral-yu.github.io/3DGS-Viewer-Spark-Test/

Open the page and load local splat files with `Open File`, or drop one or more supported files into the viewport. Dropped files are added to the current scene in order. You can also add one of the built-in procedural samples.

### Direct open

Open `index.html`, then use `Open File` or drop supported splat files into the viewer.
On Windows, if Chrome exits immediately, `npm run open` uses the bundled
PowerShell launcher with browser-safe flags and an automatic Edge fallback.
On macOS/Linux, use the local dev server when module-Worker features are needed.

### Local dev server

```powershell
npm install
npm run build
npm run dev
```

Then open the local dev server URL shown in the terminal.

## Supported formats

- `.ply`
- `.spz`
- `.splat`
- `.ksplat`

## Viewer features

- `Spatial LookDev Lab` global renderer selector with one visible render canvas at a time
- renderer-neutral typed-array scene snapshot copied from `SplatMesh.forEachSplat`
- direct-open local workflow without a dev server
- orbit and first-person camera controls
- splat management with visibility, delete, export, and transform controls
- linear sRGB grading controls with sRGB display output
- point-light management with inverse-square falloff
- cached all-visible-splat occlusion for Spark point lights without overwriting source RGB
- low-FPS preview during non-exposure edits followed by a final render when input ends
- cross-display UI sizing that keeps controls at 1× and grows them conservatively to 1.25× on large CSS viewports, with DPR-aware canvas resolution
- compact light workbench with locally resolved fonts, fixed inspector tabs, independently scrolling settings, and full-width alignment coordinate rows
- procedural primitive splats, including mesh-derived `Bunny` and `dragon`

Per-item tone curves stay active when another splat or a light is selected.
The editor curve, Spark shader, and color readouts use the same monotone cubic
interpolation: linear exposure → occluded direct lighting → Master/RGB curves
→ sRGB display. Editing a curve does not recompute geometric occlusion.

## Renderer backends

| Backend | Gaussian path | SH / color | Lighting and shadow boundary |
| --- | --- | --- | --- |
| Spark 2.0 (default) | Existing native Spark renderer | Source-dependent SH0–SH3 | Look-dev controls and selected-item animation remain active. Optional cached all-splat point-light occlusion supports static scenes; the shared static-baked SH0 below is also displayed. |
| PlayCanvas 2.21.2 | Public `GSplatData` + `GSplatResource` unified GSplat renderer | SH0 base RGB snapshot | Spark grading, animation modifiers, and lights are not transferred. Animation is Spark only; no live receive/cast. |
| Three.js r186dev | Instanced camera-facing anisotropic Gaussian ellipse quads with projected covariance and deterministic depth sorting | SH0 base RGB snapshot | Spark grading, animation modifiers, and lights are not transferred. Animation is Spark only; no live receive/cast. |

Alternate backends consume only the copied snapshot. They never render through
Spark, and a failed backend activation leaves the currently active backend in
place with a visible status message. The previous canvas is retained until its
replacement is ready; the visible-only snapshot is captured after lazy vendor
loading so scene edits made during loading are not lost. PlayCanvas and Three.js are separate
classic-script bundles loaded only on first selection, so Spark startup does
not evaluate either vendor. The Three backend asserts
`THREE.REVISION === "186dev"`; selecting it still reports the expected
multiple-Three warning because Spark r180 and the comparison renderer coexist.
All three generated bundles are minified at build time; this changes delivery
and parse cost only, not renderer parameters or lighting math.

Three receives exact world-space Gaussian covariance, including non-uniform
scale, shear, and reflection. Covariance is packed once per snapshot or edited
item, then reused for camera-depth sorting and GPU projection. The separate
static-bake transform restrictions below still apply.

## Point-light occlusion

In Spark, add a point light and enable **Light → Occlusion**. Every visible
splat is included as both a receiver and a possible blocker; this is not the
legacy 32-proxy preview. A Worker builds one BVH and caches a scalar transmission
value for each splat/light pair. Spark reads these values by stable source index
and attenuates only the added direct light, leaving the original RGB/SH intact.

- Moving a light or splat, editing geometry/opacity, or changing visibility
  invalidates the cache immediately and schedules a refresh after input settles.
  Camera motion and light intensity/color changes reuse the cache.
- **Update Shadows** retries explicitly. **Cancel Shadows** stops pending or
  running work. Until a fresh cache is ready, added light is unoccluded and the
  status explains whether work is queued, running, canceled, or unavailable.
- The opt-in path supports up to 8 visible lights and 8,000,000 splat/light
  pairs, subject to the GPU texture-size limit. Exceeding a limit rejects the
  whole update rather than sampling a subset or silently dropping blockers.
- Active animation/modifiers, paged or covariance-only splat storage, static
  Bake, and alternate renderers are not supported by this cache. Clear the
  animation/Bake or return to Spark to refresh it. As with static Bake, visible
  transforms must be rigid or uniformly scaled; shear/reflection are rejected.
- `file://` uses the same cooperative main-thread fallback as static Bake.

This is cached visibility, not a full-scene ray trace every frame or physical
global illumination. The optical-depth kernel approximates each Gaussian using
its largest scale as a spherical support radius. All blockers are considered,
but thin/anisotropic splats can produce broader shadows than their exact shape.
Imported radiance is not relit into albedo, and this feature does not add bounce.

## Static lighting

The production static-light path is separate from each live renderer, so one
bake result is shared by Spark, PlayCanvas, and Three.js:

- **All-splat direct** builds a deterministic packed BVH over every visible
  splat and evaluates Gaussian optical depth between the selected point light
  and every receiver. There is no 32-proxy cap in this path.
- Work runs in a module Worker with staged progress and cancellation. Under
  `file://`, or when a module Worker is unavailable, the same exact direct and
  authored-bounce kernels run through a cooperative main-thread fallback.
- The result replaces SH0 RGB reversibly. `Clear / Restore` restores the exact
  pre-bake RGB, and scene/light/transform changes mark or cancel stale work.
- Imported generic 3DGS RGB/SH is captured radiance, not diffuse albedo.
  **Preserve captured radiance** is therefore the default. The optional generic
  visibility modulation is explicitly nonphysical.
- **Direct + authored one bounce** is experimental and limited to built-in Cube
  and Macbeth splats carrying explicit diffuse-albedo, normal, and surface-area
  provenance. Generic splats may occlude both path legs, but never become
  bounce emitters or receivers. Sources are compressed into at most 96
  item/normal-coherent clusters and total source-to-receiver work is capped at
  192,000 paths.
- Static baking currently accepts rigid or uniformly scaled items. A visible
  non-uniformly scaled, sheared, or mirrored item is rejected rather than
  silently using an invalid Gaussian bound or flipped authored normal.

The two live controls labelled **Legacy sampled shadow (32 proxies)** and
**Legacy 6-VPL bounce preview** remain opt-in diagnostics only. They are disabled
by default and are not the production all-splat bake.

### Reference performance

Pure Node reference measurements recorded on a deterministic sparse fixture
(LCG seed `0x20260811`; wide XYZ distribution; sigma `0.02..0.10`). These are
development benchmark results, not assertions run by `npm test`:

| Splats | Packed BVH nodes | Broad-phase candidates | Build + trace |
| ---: | ---: | ---: | ---: |
| 2,000 | 255 | 106,784 | 17.3 ms |
| 100,000 | 16,383 | 14,522,564 | 625.5 ms |
| 1,000,000 | 131,071 | 397,204,700 | 22.5 s |

The 1M run used about 163 MiB RSS and completed inside a 60-second guard. Dense,
heavily overlapping Gaussian scenes can cost more than this sparse reference.
The same 100k fixture completed in about 0.65 s in a Chrome module Worker after
switching cooperative yields from timer-clamped tasks to `MessageChannel`;
its SHA-256 output remained
`8d96721a61e9f9425a6ef88aced999a5cb99414f695698478bfde16b150319cc`.

## Notes

- The repository does not ship a large captured sample model; it does ship the procedural samples listed above.
- For GitHub Pages, publish the repository contents as static files.
- If you want a public sample, add a small model separately instead of committing the full local dataset.
- Third-party license notes are listed in `THIRD_PARTY_NOTICES.md`.
- The application source is MIT-licensed, but the bundled Stanford Bunny/dragon
  data is not MIT: research use and free redistribution are permitted with
  acknowledgement; commercial use requires permission. See the notices for
  sample-data restrictions and the complete runtime license texts.
- Point lights relight splats only in `Beauty` mode. Diagnostic modes remain unlit on purpose.
- Spark exposes Gaussian falloff as a renderer-wide setting, so the UI restores functional falloff through `SparkRenderer.falloff`.
- Three.js does not yet have an official stable r186 release in this project baseline. The `three-r186` package is pinned to official upstream commit `283a3b359d70bf6dc7b54bc129698fbb32be49a9`, and the adapter verifies the runtime revision string `186dev`.
- Authored bounce source grouping currently assumes the supported Cube axis normals and Macbeth `+Z` normal. Before adding oblique authored materials, tighten the normal-coherence key; arbitrary normals in the same coarse direction bucket can otherwise produce large clustering error.
- `Bunny` and `dragon` are generated from official Stanford 3D Scanning Repository mesh files (`bun_zipper_res2.ply` and `dragon_vrip_res3.ply`) converted into runtime splats. The repository asks users to acknowledge Stanford Computer Graphics Laboratory and allows research/free redistribution while restricting commercial use without permission: https://graphics.stanford.edu/data/3Dscanrep/
