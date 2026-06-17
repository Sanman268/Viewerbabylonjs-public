import "./styles.css";
import { createScene } from "./viewer/createScene";
import { CameraController } from "./viewer/camera";
import { loadModel } from "./viewer/loadModel";
import { applyVectaryLook, type RenderLook } from "./viewer/renderPipeline";
import { recolorVectary } from "./viewer/recolor";
import { addGroundShadow, type GroundShadow } from "./viewer/groundShadow";
import { SelectionManager } from "./viewer/selection";
import { HoverManager } from "./viewer/hover";
import { InfoPanel } from "./ui/infoPanel";
import { LoadingOverlay } from "./ui/loadingOverlay";
import { SearchBox } from "./ui/searchBox";
import { StatsOverlay } from "./ui/statsOverlay";
import { loadPartsMetadata } from "./data/metadata";

/**
 * Application entry point. Boots the engine, wires the viewer modules to the UI,
 * loads the model and starts the render loop. Everything created here is torn
 * down in `dispose()` so the viewer can be cleanly re-created (e.g. on HMR).
 */
async function main(): Promise<void> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("Render canvas not found");

  const overlay = new LoadingOverlay();
  const { engine, scene, keyLight } = createScene(canvas);
  const camera = new CameraController(scene, canvas);
  const selection = new SelectionManager(scene);
  const hover = new HoverManager(scene);
  const infoPanel = new InfoPanel();
  const stats = new StatsOverlay(engine, scene);

  // Core viewer + UI are constructed and the real stylesheet has applied, so
  // drop the boot fallback and reveal the styled app (prevents reload FOUC).
  document.body.classList.remove("app-booting");

  // Selection <-> panel wiring. The hover layer is told the current selection so
  // it never competes with the (stronger) selection highlight on those meshes.
  selection.onSelect = (part) => {
    hover.setSelected(part);
    if (part) infoPanel.show(part);
    else infoPanel.clear();
  };
  infoPanel.onClear = () => selection.clear();

  // Start the render loop immediately so the loading state is responsive.
  engine.runRenderLoop(() => scene.render());

  // --- UI controls -----------------------------------------------------------
  const resetBtn = document.getElementById("resetBtn");
  resetBtn?.addEventListener("click", () => camera.reset());

  const statsBtn = document.getElementById("statsBtn");
  statsBtn?.addEventListener("click", () => {
    const on = stats.toggle();
    statsBtn.setAttribute("aria-pressed", String(on));
    statsBtn.classList.toggle("btn--active", on);
  });

  // Search shows a dropdown of matching parts; selection happens only when the
  // user picks a result, not while typing.
  const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
  const searchResults = document.getElementById("searchResults");
  let searchBox: SearchBox | null = null;
  if (searchInput && searchResults) {
    searchBox = new SearchBox({
      input: searchInput,
      results: searchResults,
      find: (q) => selection.findMatches(q),
      onPick: (match) => {
        const part = selection.selectByMesh(match.mesh);
        camera.focusOnMeshes(part.meshes); // zoom-to-fit the chosen part
      },
    });
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return; // don't hijack typing
    if (e.key === "r" || e.key === "R") camera.reset();
    if (e.key === "Escape") selection.clear();
  };
  window.addEventListener("keydown", onKeyDown);

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  // --- Load the model --------------------------------------------------------
  // Kick off metadata loading in parallel with the model. Selection falls back
  // to generated metadata if this hasn't resolved yet, so it never blocks.
  const metadataReady = loadPartsMetadata();

  let look: RenderLook | null = null;
  let shadow: GroundShadow | null = null;
  try {
    const model = await loadModel(scene, (pct) => overlay.setProgress(pct));
    camera.frameToBounds(model.min, model.max);

    // Re-skin the dark greyscale GLB with a colour-coded "design-tool" palette.
    recolorVectary(scene);

    // Soft contact shadow to ground the model (shadow-only ground, transparent
    // elsewhere so the backdrop and object look are unchanged).
    shadow = addGroundShadow(scene, keyLight, model.meshes, model.min, model.max);

    // Studio "design-tool" render look (SSAO + ACES tone mapping + AA). Set up
    // after framing so the SSAO radius can be scaled to the model's real size.
    look = applyVectaryLook(scene, camera.camera, model.min, model.max);

    // Triangle count is geometry-fixed, so compute it once for the stats overlay.
    const totalTriangles = model.meshes.reduce(
      (sum, m) => sum + Math.round(m.getTotalIndices() / 3),
      0
    );
    stats.setModelStats({ variant: model.variant, totalTriangles });

    await metadataReady;
    await scene.whenReadyAsync();
    overlay.hide();
  } catch (err) {
    console.error("Failed to load model:", err);
    overlay.error("Could not load the 3D model. Please refresh to try again.");
  }

  // --- Teardown --------------------------------------------------------------
  const dispose = () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    searchBox?.dispose();
    shadow?.dispose();
    look?.dispose();
    stats.dispose();
    hover.dispose();
    selection.dispose();
    scene.dispose();
    engine.dispose();
  };
  window.addEventListener("beforeunload", dispose);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

main().catch((err) => console.error(err));
