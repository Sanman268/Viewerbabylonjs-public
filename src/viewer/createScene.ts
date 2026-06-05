import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader"; // side-effect: enables .env (prefiltered IBL) loading
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

export interface ViewerContext {
  engine: Engine;
  scene: Scene;
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
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene(engine);
  // Transparent clear so the CSS gradient backdrop is visible behind the model.
  scene.clearColor = new Color4(0, 0, 0, 0);

  // Image-based lighting: PBR metallic/roughness materials reflect this
  // environment, so without it metal parts render dark/flat. The .env is a
  // small prefiltered cube bundled in /public, keeping the demo self-contained.
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    `${import.meta.env.BASE_URL}environment.env`,
    scene
  );
  scene.environmentIntensity = 1.0;

  // Soft ambient fill so shadowed faces stay legible alongside the IBL.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.5;
  hemi.groundColor = new Color3(0.25, 0.27, 0.3);

  // Single directional key light for form and specular highlights.
  const key = new DirectionalLight("key", new Vector3(-0.5, -1, -0.6), scene);
  key.intensity = 1.0;

  return { engine, scene };
}
