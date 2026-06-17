import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent"; // SSAO/SSR source buffers
import "@babylonjs/core/Rendering/depthRendererSceneComponent"; // required by SSR
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Maximum-quality "design-tool" render look. Purely a post-processing layer —
 * scene, materials and selection are untouched — so it can be removed without
 * side effects. The stack, in compositing order:
 *
 *   1. SSAO2 (high sample count): soft ambient occlusion in crevices/contacts.
 *   2. SSR: screen-space reflections so the chrome parts reflect the rest of the
 *      model, not just the environment — the biggest "rendered" jump.
 *   3. DefaultRenderingPipeline: KHR-Neutral tone mapping (built for product
 *      viewers — keeps colours accurate), saturation lift, 8x MSAA + FXAA + a
 *      sharpen pass, and gentle bloom on the hottest highlights.
 *
 * Pipelines are created in that order because the post-process manager composites
 * them in creation order, so tone mapping/bloom run last over the AO'd, reflected
 * image. Set up AFTER framing so screen-space radii/distances scale to the model.
 */
export interface RenderLook {
  default: DefaultRenderingPipeline;
  ssao: SSAO2RenderingPipeline | null;
  ssr: SSRRenderingPipeline | null;
  dispose(): void;
}

export function applyVectaryLook(
  scene: Scene,
  camera: Camera,
  min: Vector3,
  max: Vector3
): RenderLook {
  const diagonal = max.subtract(min).length() || 1;

  // --- Ambient occlusion (high quality) -------------------------------------
  let ssao: SSAO2RenderingPipeline | null = null;
  if (SSAO2RenderingPipeline.IsSupported) {
    ssao = new SSAO2RenderingPipeline(
      "ssao",
      scene,
      { ssaoRatio: 1, blurRatio: 1 }, // full-res AO + full-res blur
      [camera],
      true // geometry-buffer path (no PrePass dependency)
    );
    ssao.radius = diagonal * 0.02; // tight contact darkening
    ssao.totalStrength = 0.9;
    ssao.base = 0.2; // ambient floor so crevices never crush to black
    ssao.samples = 32; // high sample count = smooth, noise-free AO
    ssao.maxZ = diagonal * 20;
    ssao.minZAspect = 0.2;
    ssao.expensiveBlur = true;
    ssao.bilateralSamples = 16; // wider edge-aware blur
  }

  // --- Screen-space reflections ---------------------------------------------
  // Lets the chrome shocks/rims reflect the blue springs and white frame.
  let ssr: SSRRenderingPipeline | null = null;
  try {
    ssr = new SSRRenderingPipeline("ssr", scene, [camera], true /* geometry buffer */);
    ssr.strength = 0.8; // reflection intensity
    ssr.reflectionSpecularFalloffExponent = 2.5;
    ssr.enableSmoothReflections = true; // blur by roughness instead of mirror-sharp
    ssr.enableAutomaticThicknessComputation = true; // accurate, fewer artefacts
    ssr.roughnessFactor = 0.15;
    ssr.maxSteps = 128;
    ssr.maxDistance = diagonal * 2;
    ssr.selfCollisionNumSkip = 2;
    ssr.blurDispersionStrength = 0.03; // soften rough-surface reflections
    ssr.clipToFrustum = true;
  } catch (e) {
    console.warn("SSR unavailable, skipping:", e); // degrade gracefully
    ssr = null;
  }

  // --- Tone mapping, colour, bloom and anti-aliasing ------------------------
  const pipeline = new DefaultRenderingPipeline("look", true, scene, [camera]);

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  // KHR PBR Neutral is purpose-built for product/commerce viewers: it tone-maps
  // highlights without the colour shift/desaturation ACES introduces.
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.15; // keep highlights off the clip ceiling so form stays visible
  ip.contrast = 1.15;
  const curves = new ColorCurves();
  curves.globalSaturation = 40;
  ip.colorCurves = curves;
  ip.colorCurvesEnabled = true;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 2.5;
  ip.vignetteStretch = 0.5;

  // High-quality anti-aliasing: 8x MSAA on geometry, FXAA for shader/spec edges,
  // plus a light sharpen to re-crisp reflections that FXAA softens.
  pipeline.samples = 8;
  pipeline.fxaaEnabled = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.3;

  // Gentle bloom so the hottest chrome/spec highlights glow slightly.
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.92; // only genuinely hot highlights bloom
  pipeline.bloomWeight = 0.1;
  pipeline.bloomScale = 0.5;

  return {
    default: pipeline,
    ssao,
    ssr,
    dispose() {
      pipeline.dispose();
      ssao?.dispose();
      ssr?.dispose();
    },
  };
}
