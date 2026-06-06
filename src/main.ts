import "./styles.css";
import { createScene } from "./viewer/createScene";
import { CameraController } from "./viewer/camera";
import { loadModel } from "./viewer/loadModel";
import { SelectionManager } from "./viewer/selection";
import { InfoPanel } from "./ui/infoPanel";
import { LoadingOverlay } from "./ui/loadingOverlay";
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
  const { engine, scene } = createScene(canvas);
  const camera = new CameraController(scene, canvas);
  const selection = new SelectionManager(scene);
  const infoPanel = new InfoPanel();

  // Core viewer + UI are constructed and the real stylesheet has applied, so
  // drop the boot fallback and reveal the styled app (prevents reload FOUC).
  document.body.classList.remove("app-booting");

  // Selection <-> panel wiring.
  selection.onSelect = (part) => (part ? infoPanel.show(part) : infoPanel.clear());
  infoPanel.onClear = () => selection.clear();

  // Start the render loop immediately so the loading state is responsive.
  engine.runRenderLoop(() => scene.render());

  // --- UI controls -----------------------------------------------------------
  const resetBtn = document.getElementById("resetBtn");
  resetBtn?.addEventListener("click", () => camera.reset());

  const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => selection.selectFirstMatch(searchInput.value));

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

  try {
    const model = await loadModel(scene, (pct) => overlay.setProgress(pct));
    camera.frameToBounds(model.min, model.max);
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
    selection.dispose();
    scene.dispose();
    engine.dispose();
  };
  window.addEventListener("beforeunload", dispose);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

main().catch((err) => console.error(err));
