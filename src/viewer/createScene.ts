import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader"; 
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

export interface ViewerContext {
  engine: Engine;
  scene: Scene;
  /** Directional key light, reused as the contact-shadow caster. */
  keyLight: DirectionalLight;
}

/**
 * Create the engine, scene and lighting rig.
 *
 * The scene is cleared to transparent so the CSS studio-gradient backdrop shows
 * through. Lighting is intentionally simple: IBL drives the PBR reflections
 * (essential for the metal parts to read correctly) with a soft hemispheric
 * fill and a single directional key for form.
 */
export function createScene(canvas: HTMLCanvasElement): ViewerContext {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true, // required by the HighlightLayer used for selection
    antialias: true,
  });
  // Supersample (SSAA): render above display resolution and downsample for crisp
  // edges and reflections. Capped at 2x device-independent pixels so high-DPI
  // screens don't blow up the framebuffer.
  const renderScale = Math.min((window.devicePixelRatio || 1) * 1.5, 2);
  engine.setHardwareScalingLevel(1 / renderScale);

  const scene = new Scene(engine);
  // Transparent clear so the CSS gradient backdrop is visible behind the model.
  scene.clearColor = new Color4(0, 0, 0, 0);

  // Image-based lighting: PBR metallic/roughness materials reflect this
  // environment, so without it metal parts render dark/flat. studio.env is a
  // prefiltered studio-softbox cube (bundled in /public) — its bright, defined
  // light sources give the metals crisp product-shot reflections.
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    `${import.meta.env.BASE_URL}studio.env`,
    scene
  );
  // Moderate IBL: enough to light the metals, but not so bright it floods the
  // painted parts to white and flattens the form.
  scene.environmentIntensity = 1.55;

  // Light ambient fill — kept low so the directional key still shapes the form.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.4;
  hemi.groundColor = new Color3(0.3, 0.32, 0.35);

  // Directional key light shapes the form and adds specular — kept moderate so
  // it doesn't stack with the IBL and wash flat white panels to pure white.
  const key = new DirectionalLight("key", new Vector3(-0.5, -1, -0.6), scene);
  key.intensity = 1.3;

  return { engine, scene, keyLight: key };
}
