# 3DGS Viewer Spark Test

Static 3D Gaussian Splatting viewer built with Spark 2.0 Preview and Three.js.

This project is intended as a place to test 3DGS linear workflow behavior, color grading, and related look-development workflows.
There are currently very few web-based tools that focus on this kind of testing.

This repository is kept intentionally small for GitHub Pages. Large sample models are not stored here.

## Included

- `index.html`
- `viewer.js`
- `viewer.bundle.js`
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

Open the page and load local splat files with `Open File` or drag-and-drop.

### Direct open

Open `index.html`, then use `Open File` or drag a splat file into the viewer.

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

## Notes

- The repository does not ship a bundled sample model.
- For GitHub Pages, publish the repository contents as static files.
- If you want a public sample, add a small model separately instead of committing the full local dataset.
- Third-party license notes are listed in `THIRD_PARTY_NOTICES.md`.
