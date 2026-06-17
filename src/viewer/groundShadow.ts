import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly/shadowOnlyMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Add a soft contact shadow under the model to ground it (Vectary-style), without
 * touching the model's look. A ground plane uses ShadowOnlyMaterial: it renders
 * *only* where the model's shadow falls and stays transparent everywhere else, so
 * the CSS studio-gradient backdrop still shows through and nothing about the
 * recoloured object changes.
 */
export interface GroundShadow {
  dispose(): void;
}

export function addGroundShadow(
  scene: Scene,
  key: DirectionalLight,
  meshes: AbstractMesh[],
  min: Vector3,
  max: Vector3
): GroundShadow {
  // High-resolution contact-hardening (PCSS) shadow: sharp where parts touch the
  // ground, softening with distance — physically plausible, like a studio render.
  const generator = new ShadowGenerator(2048, key);
  generator.useContactHardeningShadow = true;
  generator.contactHardeningLightSizeUVRatio = 0.08; // penumbra size
  generator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  generator.darkness = 0.5; // 0 = black, 1 = invisible; keep it gentle

  // Every real mesh casts; the ground only receives.
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() > 0) generator.addShadowCaster(mesh, false);
  }

  // Ground sits just under the lowest point of the model, sized well past the
  // footprint so the blurred shadow never clips at the plane edge.
  const spanX = (max.x - min.x) || 1;
  const spanZ = (max.z - min.z) || 1;
  const size = Math.max(spanX, spanZ) * 4;
  const ground = CreateGround("shadowGround", { width: size, height: size }, scene);
  ground.position.x = (min.x + max.x) / 2;
  ground.position.z = (min.z + max.z) / 2;
  ground.position.y = min.y - (max.y - min.y) * 0.001; // hair below the tyres
  ground.receiveShadows = true;
  ground.isPickable = false; // clicks pass through to clear selection, not select the floor

  const mat = new ShadowOnlyMaterial("shadowOnly", scene);
  mat.activeLight = key;
  ground.material = mat;

  return {
    dispose() {
      generator.dispose();
      mat.dispose();
      ground.dispose();
    },
  };
}
