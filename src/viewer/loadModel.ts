import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF"; // registers the .glb/.gltf loader plugin
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ISceneLoaderProgressEvent } from "@babylonjs/core/Loading/sceneLoader";

const MODEL_DESKTOP = "double_axle_suspension-v1.glb";
const MODEL_MOBILE = "double_axle_suspension-v1_Mobile.glb";

export interface LoadedModel {
  meshes: AbstractMesh[];
  /** World-space bounding box of the whole model. */
  min: Vector3;
  max: Vector3;
}

/** Pick the lighter GLB on touch / small-screen devices. */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const touch = (navigator.maxTouchPoints ?? 0) > 1 && window.innerWidth < 1024;
  return ua || touch;
}

/** Compute the combined world-space bounds of a set of meshes. */
function computeWorldBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of meshes) {
    if (mesh.getTotalVertices() === 0) continue; // skip transform-only nodes
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bb.minimumWorld);
    max.maximizeInPlace(bb.maximumWorld);
  }

  // Fallback for an empty/degenerate model so framing never produces NaN.
  if (!isFinite(min.x)) {
    min.set(-1, -1, -1);
    max.set(1, 1, 1);
  }
  return { min, max };
}

/**
 * Load the suspension GLB, selecting the desktop or mobile variant by device.
 * Resolves with the imported meshes and the model's world bounds (used to frame
 * the camera). Rejects if the asset fails to load.
 */
export async function loadModel(
  scene: Scene,
  onProgress?: (percent: number | null) => void
): Promise<LoadedModel> {
  const file = isMobileDevice() ? MODEL_MOBILE : MODEL_DESKTOP;
  // import.meta.env.BASE_URL keeps the path correct under any deploy sub-path.
  const rootUrl = `${import.meta.env.BASE_URL}models/`;

  const result = await SceneLoader.ImportMeshAsync(
    "",
    rootUrl,
    file,
    scene,
    (evt: ISceneLoaderProgressEvent) => {
      if (!onProgress) return;
      onProgress(evt.lengthComputable ? (evt.loaded / evt.total) * 100 : null);
    }
  );

  const { min, max } = computeWorldBounds(result.meshes);
  return { meshes: result.meshes, min, max };
}
