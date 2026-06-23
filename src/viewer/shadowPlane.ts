import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

/** Peak darkness of the blob at its centre (0 = none, 1 = solid black). */
const SHADOW_STRENGTH = 0.45;

/**
 * Add a soft "blob" contact shadow beneath the model.
 *
 * Rather than a real shadow-map cast (which produces a hard, holey silhouette
 * for an open frame like this assembly), this draws a radial gradient — dark at
 * the centre, fading smoothly to transparent — onto a flat plane at the base of
 * the model. The result is the soft, evenly diffused product-shot shadow.
 *
 * Performance: this is a single alpha-blended plane with a baked texture. There
 * is no shadow map and no per-frame shadow rendering at all.
 */
export function addShadowPlane(
  scene: Scene,
  min: Vector3,
  max: Vector3
): void {
  const size = max.subtract(min);
  const center = min.add(max).scale(0.5);
  const span = Math.max(size.x, size.z) || 1;

  // Bake the radial gradient once into a texture.
  const res = 512;
  const tex = new DynamicTexture("blobShadow", res, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const r = res / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  // Soft falloff: hold near the centre, then ease out to fully transparent.
  grad.addColorStop(0.0, `rgba(0,0,0,${SHADOW_STRENGTH})`);
  grad.addColorStop(0.35, `rgba(0,0,0,${SHADOW_STRENGTH * 0.6})`);
  grad.addColorStop(0.7, `rgba(0,0,0,${SHADOW_STRENGTH * 0.15})`);
  grad.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, res, res);
  tex.hasAlpha = true;
  tex.update();

  // Generous footprint so the soft edge fades out well beyond the model.
  const ground = CreateGround("shadowPlane", { width: span * 2.6, height: span * 2.6 }, scene);
  ground.position.set(center.x, min.y + 0.001, center.z); // hair above base to avoid z-fight
  ground.isPickable = false; // never intercept part-selection picks

  const mat = new StandardMaterial("blobShadowMat", scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true; // pure baked gradient, unaffected by scene lights
  mat.opacityTexture = tex; // gradient alpha drives transparency
  ground.material = mat;
}
