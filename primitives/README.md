Primitive source folder for the direct-open 3DGS viewer.

- `primitive-library.js`
  Contains the runtime-authored primitive definitions for:
  - `Sphere`
  - `Cube`
  - `Macbeth`

Notes:
- Macbeth patch values are stored as linear sRGB float triples sampled from:
  `https://raw.githubusercontent.com/colour-science/colour-nuke/master/colour_nuke/resources/images/ColorChecker2014/sRGB_ColorChecker2014.exr`
- Macbeth is authored as layered multi-splat patches so a single chart reads less transparently, and its falloff remains adjustable from the viewer UI.
- Viewer rendering stays in sRGB output, while color math continues in linear sRGB.
