# Babylon.js Suspension Viewer

An interactive 3D viewer for a double-axle suspension assembly. Load the model
in the browser, orbit and zoom, click parts to highlight them, and read each
part's name and attributes in an info panel.

**Live demo:** https://sanman268.github.io/Viewerbabylonjs/

---

## Features

- **Reliable GLB loading** with a loading state, progress, and an error fallback.
- **Auto-frame on load** — the model is centered and scaled to fit the camera.
- **Orbit / zoom controls** with sensible zoom limits; the model stays centered.
- **Animated "Reset view"** control (button, or press `R`).
- **Click to select** a single physical part; it highlights clearly (orange,
  non-destructive). Clicking empty space (or `Esc`) clears the selection.
- **Info panel** showing the part name plus model-derived attributes
  (vertices, triangles, materials, dimensions).
- **Search** parts by name.
- **Desktop + mobile**: tap-to-select, pinch-zoom, and a lighter GLB on phones.

## Tech stack

- [Babylon.js](https://www.babylonjs.com/) (`@babylonjs/core` + `@babylonjs/loaders`)
- TypeScript
- [Vite](https://vitejs.dev/) for dev server and build
- No UI framework — plain DOM for the overlay/panel to keep things small and readable.

## Getting started

**Prerequisites:** Node.js 18+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```

## Project structure

```
src/
  main.ts                # entry point: wires modules together, render loop, teardown
  viewer/
    createScene.ts       # engine, scene, IBL + lights
    camera.ts            # ArcRotateCamera, zoom limits, animated reset
    loadModel.ts         # GLB load (device-aware), centering, world bounds
    selection.ts         # pointer picking, highlight, spatial part grouping
  ui/
    infoPanel.ts         # renders the selected part's name + attributes
    loadingOverlay.ts    # loading / progress / error states
  data/
    metadata.ts          # mesh-name normalization + external metadata loader
public/
  models/                # GLB assets (desktop + mobile variants)
  metadata/parts.json    # data-driven part labels/categories (curated mapping)
  environment.env        # prefiltered IBL environment (for PBR reflections)
```

The split mirrors responsibilities: everything 3D lives in `viewer/`, everything
DOM lives in `ui/`, and they communicate through small typed callbacks
(`SelectionManager.onSelect`, `InfoPanel.onClear`) rather than reaching into each
other.

## Approach & key decisions

- **Selection = one physical part, derived from mesh data.** This GLB is a
  Sketchfab export: a parent node can contain *two* physical objects (e.g. the
  left **and** right wheel), and each object is split by material into separate
  meshes (tire vs rim). So neither "the picked mesh" (a fragment) nor "all of the
  parent's children" (two wheels) is correct. On click, the viewer flood-fills
  from the picked mesh to **sibling meshes whose world bounding boxes overlap**,
  grouping the slices of one physical object while excluding its spatially
  separated twin. Part names always come from the mesh/node name — nothing is
  hardcoded per object.

- **Non-destructive highlighting.** Selection uses a Babylon `HighlightLayer`
  (an overlay glow), so original materials are never mutated and clearing or
  changing the selection always restores the model exactly.

- **IBL lighting.** The metal parts are PBR metallic/roughness, which need an
  environment to reflect. A small prefiltered `.env` is bundled in `public/`
  (no CDN dependency) so the demo is self-contained and the colors match the
  source model.

- **Data-driven metadata, computed attributes.** Curated part labels/categories
  live in `public/metadata/parts.json` (not in TypeScript), loaded at runtime and
  keyed by the normalized mesh base name. Unknown meshes fall back to a label
  generated from the mesh/node name plus a keyword-inferred category, so the
  panel always has content even if the JSON is missing. Quantitative attributes
  (vertices, triangles, materials, dimensions) are always read from the selected
  GLB mesh; any extra attributes in the JSON are merged in alongside them.

- **No per-frame work for interaction.** Picking and highlighting are driven by
  pointer events (`POINTERTAP`), never polled in the render loop. `POINTERTAP`
  also distinguishes a tap from an orbit-drag, which is what makes touch behave.

- **Deploy-anywhere build.** `base: "./"` emits relative asset paths and the
  runtime resolves the model via `import.meta.env.BASE_URL`, so the same `dist/`
  works at a domain root or under a project sub-path.

## Controls

| Action          | Desktop                | Mobile           |
| --------------- | ---------------------- | ---------------- |
| Rotate          | Left-drag              | One-finger drag  |
| Zoom            | Mouse wheel            | Pinch            |
| Select part     | Click                  | Tap              |
| Clear selection | Click empty space / `Esc` | Tap empty space |
| Reset view      | `Reset view` button / `R` | Reset button   |

## Deployment

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and publishes
`dist/` to **GitHub Pages** on every push to the default branch.

1. Push the repo to GitHub.
2. In **Settings → Pages**, set **Source = GitHub Actions**.
3. Push to `main`/`master` (or run the workflow manually). The live URL appears
   in the Actions run summary and on the Pages settings page.

The build is a static bundle, so it also drops straight onto **Netlify** or
**Vercel** (build command `npm run build`, output directory `dist`).

## Assumptions

- The provided GLB has meaningfully named meshes/nodes; part names are derived
  from them rather than hardcoded.
- Two GLB variants are provided; the lighter `*_Mobile.glb` is used on
  touch/small-screen devices to keep load and rendering light.
- Dimensions are reported in the model's own units (the source has no real-world
  scale metadata).
- No branding requirements — the UI is intentionally minimal and functional.

## Known limitations

- **Imperfect physical grouping on an awkward model.** The bounding-box flood
  fill groups one wheel's tire+rim correctly, but it relies on a spatial overlap
  threshold. On parts authored with unusual gaps or heavy material merging it can
  occasionally under- or over-group. A model authored with one mesh (or node) per
  physical part would make this exact.
- The bundled `.env` is a neutral studio environment, so reflections won't be
  pixel-identical to the source's original environment.
- No tone-mapping/post-processing is applied, to keep colors matching the source.

## What I'd build next with more time

- **Robust part grouping** via connected-component analysis on shared vertices
  (true geometry connectivity) instead of bounding-box overlap.
- **Hover highlight + tooltip**, and an **outline** highlight option.
- A **parts list / tree** synced with selection and search.
- **Exploded view** and per-part isolate/hide.
- A **performance stats** toggle (FPS, draw calls) and optional mesh merging by
  material to reduce draw calls.
- Unit tests for the name-normalization and grouping logic.
