# Rendering and lighting

[Back to README](../README.md)

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

## Color and PLY interchange

- Untagged imported splats are treated as **sRGB**. Built-in primitives and
  explicitly tagged legacy linear exports retain their Linear sRGB meaning.
- Exposure, lighting, LUTs, and tone curves use Linear sRGB. Spark decodes after
  source SH evaluation and encodes after grading; individual SH coefficients
  are not passed through a nonlinear transfer function. Alternate backends
  receive linear snapshots and encode once, with tone mapping disabled.
- Display and PLY export use the exact sRGB transfer function, not gamma 2.2.
  Native encoded-color Gaussian blending is retained for splat-viewer
  compatibility; coverage, filtering, and sorting can still differ by backend.
- Default **Export** writes sRGB SH0 appearance, including Spark exposure,
  lighting, and grading. Alternate renderers export their ungraded snapshot.
  Reopening this file starts from baked colors: do not reapply the same lighting
  or grading. Match the external viewer's background, camera, and exposure.
- Active animation, diagnostic modes, view-dependent SH, nonstandard falloff,
  and opacity above 1 cannot currently be preserved by this SH0 exporter.
  Save explains the required reset instead of silently exporting another look.
  SH/falloff checkboxes record metadata only; they do not export SH1–SH3.

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

Historical development measurements, not a current performance guarantee.

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

## Additional constraints

- Point lights affect splats only in Beauty mode; diagnostic modes remain unlit.
- The Three.js comparison backend is pinned to upstream commit
  `283a3b359d70bf6dc7b54bc129698fbb32be49a9` with runtime revision `186dev`.
- Authored bounce grouping assumes the supported Cube axis normals and Macbeth
  `+Z` normal. Oblique authored materials require a tighter normal-coherence key
  before they can be added safely.
