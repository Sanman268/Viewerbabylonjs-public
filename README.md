# Babylon.js Suspension Viewer

Interactive Babylon.js WebGL viewer for a double-axle suspension GLB model.

The demo loads a 3D model in the browser, frames it automatically, supports orbit / zoom controls, lets the user click individual parts, 
highlights the selected part, and shows a part information panel with mesh-derived attributes and optional metadata.

**Live demo:** https://sanman268.github.io/Viewerbabylonjs-public/

---

## Features

* GLB loading with loading progress and error fallback.
* Automatic model centering and camera framing on load.
* Smooth orbit and zoom controls with sensible limits.
* Reset view button and `R` keyboard shortcut.
* Click / tap part selection with non-destructive highlight.
* Hover highlight with a part-name tooltip on desktop (mouse) pointers.
* Click empty space or press `Esc` to clear selection.
* Info panel showing:

  * selected mesh / part name;
  * metadata category and description;
  * vertices, triangles, materials, dimensions;
  * optional extra attributes from `public/metadata/parts.json`.
* Search by part name.
* Optional **Stats** toggle showing FPS, mesh counts, triangle count, and the active model variant (sampled twice a second, not per frame).
* Desktop and mobile support, including touch selection and pinch zoom.
* Device-aware model loading with a lighter GLB variant for mobile.

---

## Tech stack

* Babylon.js
* TypeScript
* Vite
* Plain DOM UI, no frontend framework

---

## Setup and build

Prerequisites:

* Node.js 18+
* npm

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The production output is generated in `dist/`.

---

## Project structure

```txt
src/
  main.ts
  viewer/
    createScene.ts
    camera.ts
    loadModel.ts
    selection.ts
  ui/
    infoPanel.ts
    loadingOverlay.ts
  data/
    metadata.ts

public/
  models/
    double_axle_suspension-v1.glb
    double_axle_suspension-v1_Mobile.glb
  metadata/
    parts.json
  environment.env
```

---

## Approach and decisions

### Model loading and framing

The viewer loads a GLB from the `public/models` folder. After loading, the model bounds are calculated and the camera is framed around 
the model so the assembly starts centered and visible.

A lighter model variant is used for mobile / touch devices to reduce load and rendering cost.

### Camera controls

The viewer uses an orbit camera so the model stays centered while the user rotates and zooms. 
Zoom limits are applied to avoid clipping into the model or zooming too far away.

The reset control returns the camera to a good default view.

### Selection and highlight

Selection is driven by pointer/tap events rather than per-frame polling.

The selected part is highlighted using a Babylon highlight layer. Original mesh materials are not modified, so clearing or changing selection restores the model correctly.

### Metadata and info panel

Part names are derived from the selected mesh / node data.

Curated labels and categories are stored in `public/metadata/parts.json` and loaded at runtime. 
This keeps metadata data-driven instead of hardcoded in TypeScript.

If a selected mesh is not found in the metadata JSON, the viewer generates a fallback label and category from the mesh name.
The quantitative attributes in the info panel, such as vertices, triangles, material count, and dimensions, 
are computed from the selected Babylon mesh data.

### Mobile behavior

The viewer supports touch rotation, pinch zoom, and tap selection. A small inline boot style prevents a flash of unstyled HTML before the application CSS and loading overlay are ready.

---

## Assumptions

* The GLB has named meshes or nodes that can be used to display part names.
* Some exported mesh names may be noisy, so the app normalizes names before metadata lookup.
* The source model does not include real-world unit metadata, so dimensions are shown in model units.
* The UI is intentionally simple and functional; there are no branding requirements.
* The metadata JSON is optional. If it fails to load, the viewer still works with generated fallback metadata.

---

## Known limitations

* Part grouping depends on the structure of the source GLB. 
A model authored with one clean node or mesh per physical part would make selection more exact.
* Some metadata entries are curated examples rather than a complete engineering dataset.
* The mobile GLB is lighter, but very low-end phones may still take time to load the model.
* The lighting uses a bundled neutral environment and may not exactly match the source model’s original look.
* No advanced post-processing or configurator options are included.

---

## What I would improve with more time

* Add hover highlight and tooltip.
* Add a synchronized parts tree / part list.
* Add isolate, hide/show, and exploded-view controls.
* Add a performance stats toggle for FPS, draw calls, and triangle count.
* Improve part grouping using cleaner model hierarchy or geometry connectivity.
* Add tests for metadata name normalization and selection grouping.
* Add optional Draco / Meshopt compressed model delivery for larger production assets.

For deeper implementation details, see [`docs/TECHNICAL_NOTES.md`](docs/TECHNICAL_NOTES.md).