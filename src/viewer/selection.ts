import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import "@babylonjs/core/Layers/effectLayerSceneComponent"; // side-effect: registers the effect-layer scene component used by HighlightLayer
import "@babylonjs/core/Culling/ray"; // side-effect: enables scene.pick ray casting used for selection
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { baseNameOf, getPartMeta } from "../data/metadata";

export interface SelectedPart {
  /** Unique id of the selected mesh. */
  id: number;
  /** Raw mesh name, e.g. "tt_coilover_upper_RL.004_Material.005_0". */
  rawName: string;
  /** The selected mesh(es) — one per click in this viewer. */
  meshes: AbstractMesh[];
}

/** A single search-dropdown result: a part type and a mesh to select it by. */
export interface PartMatch {
  /** Display label (curated or humanised). */
  label: string;
  /** Functional category, shown as a secondary hint. */
  category: string;
  /** A representative mesh of the part, used to perform the selection. */
  mesh: AbstractMesh;
}

// Orange contrasts with both the blue-painted springs and the dark metal, so a
// selected part is unmistakable regardless of its own colour.
const HIGHLIGHT_COLOR = Color3.FromHexString("#ff7a18");

/**
 * Handles pointer picking, non-destructive highlighting and selection state.
 *
 * Highlighting uses a HighlightLayer, so original materials are never mutated —
 * clearing or changing the selection always restores the model exactly. A part
 * is treated as the parent node of the picked submesh, so clicking any material
 * slice highlights the whole logical part.
 */
export class SelectionManager {
  /** Called with the selected part, or null when the selection is cleared. */
  onSelect: (part: SelectedPart | null) => void = () => {};

  private readonly highlight: HighlightLayer;
  private observer: Observer<PointerInfo> | null;
  private current: SelectedPart | null = null;

  constructor(private readonly scene: Scene) {
    this.highlight = new HighlightLayer("selection", scene, {
      blurHorizontalSize: 1,
      blurVerticalSize: 1,
    });
    this.highlight.innerGlow = false;

    // POINTERTAP fires only on a press-release without a drag, so orbiting the
    // camera never triggers a selection.
    this.observer = scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) return;
      const pick = info.pickInfo;
      if (pick?.hit && pick.pickedMesh) {
        this.selectFromMesh(pick.pickedMesh);
      } else {
        this.clear();
      }
    });
  }

  /** Resolve a picked submesh to its logical part and select it. */
  private selectFromMesh(picked: AbstractMesh): void {
    const part = toPart(picked);
    if (this.current && this.current.id === part.id) return; // already selected
    this.applySelection(part);
  }

  private applySelection(part: SelectedPart): void {
    this.highlight.removeAllMeshes();
    for (const mesh of part.meshes) {
      this.highlight.addMesh(mesh as Mesh, HIGHLIGHT_COLOR);
    }
    this.current = part;
    this.onSelect(part);
  }

  /** Clear any active selection and restore the default appearance. */
  clear(): void {
    if (!this.current) return;
    this.highlight.removeAllMeshes();
    this.current = null;
    this.onSelect(null);
  }

  /**
   * Find distinct parts whose label or name matches a query, for the search
   * dropdown. Results are deduplicated by base name so each logical part type
   * appears once, ranked with label-prefix matches first.
   */
  findMatches(query: string, limit = 8): PartMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const seen = new Set<string>();
    const matches: PartMatch[] = [];
    for (const mesh of this.scene.meshes) {
      if (mesh.getTotalVertices() === 0) continue;
      const base = baseNameOf(mesh.name);
      if (seen.has(base)) continue;
      const meta = getPartMeta(mesh.name);
      const haystack = `${mesh.name} ${base} ${meta.label}`.toLowerCase();
      if (!haystack.includes(q)) continue;
      seen.add(base);
      matches.push({ label: meta.label, category: meta.category, mesh });
    }

    matches.sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.label.localeCompare(b.label);
    });
    return matches.slice(0, limit);
  }

  /**
   * Select the part containing the given mesh (used by the search dropdown) and
   * return it, so the caller can e.g. frame the camera on it.
   */
  selectByMesh(mesh: AbstractMesh): SelectedPart {
    const part = toPart(mesh);
    this.applySelection(part);
    return part;
  }

  dispose(): void {
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
    this.highlight.dispose();
  }
}

/**
 * Build a selection representing one physical part from a picked mesh.
 *
 * This GLB is awkward: a parent node (e.g. "wheel and tire combined.002") holds
 * BOTH the left and right wheel, and each wheel is split by material into
 * separate meshes (tire vs rim). So neither "the picked mesh" (a fragment) nor
 * "all of the parent's children" (two wheels) is right.
 *
 * Instead we flood-fill from the picked mesh to sibling meshes whose world
 * bounding boxes overlap it. Overlapping slices of the same physical object
 * (tire + rim, or spring + body + mount) get grouped, while the spatially
 * separated twin on the other side is left out. Limiting the search to siblings
 * stops the fill from chaining across the whole touching assembly.
 */
function toPart(picked: AbstractMesh): SelectedPart {
  const parent = picked.parent;
  const siblings = parent
    ? (parent.getChildMeshes(true).filter((m) => m.getTotalVertices() > 0) as AbstractMesh[])
    : [picked];

  if (siblings.length <= 1) {
    return { id: picked.uniqueId, rawName: picked.name, meshes: [picked] };
  }

  const boxes = new Map(siblings.map((m) => [m, worldBox(m)]));
  const pb = boxes.get(picked)!;
  const eps = pb.max.subtract(pb.min).length() * 0.1 || 0.01; // bridge tiny gaps

  // Flood fill: add any sibling overlapping something already in the cluster.
  const cluster = [picked];
  const inCluster = new Set<AbstractMesh>([picked]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of siblings) {
      if (inCluster.has(m)) continue;
      const mb = boxes.get(m)!;
      if (cluster.some((c) => overlaps(boxes.get(c)!, mb, eps))) {
        cluster.push(m);
        inCluster.add(m);
        changed = true;
      }
    }
  }

  // Stable id (lowest uniqueId in the cluster) so the same part maps to the same
  // id no matter which slice was clicked, while the twin part stays distinct.
  const id = cluster.reduce((min, m) => Math.min(min, m.uniqueId), Infinity);
  return { id, rawName: (parent ?? picked).name, meshes: cluster };
}

interface Box {
  min: Vector3;
  max: Vector3;
}

function worldBox(mesh: AbstractMesh): Box {
  mesh.computeWorldMatrix(true);
  const bb = mesh.getBoundingInfo().boundingBox;
  return { min: bb.minimumWorld, max: bb.maximumWorld };
}

/** Axis-aligned bounding-box overlap test, expanded by `eps` on every side. */
function overlaps(a: Box, b: Box, eps: number): boolean {
  return (
    a.min.x - eps <= b.max.x &&
    a.max.x + eps >= b.min.x &&
    a.min.y - eps <= b.max.y &&
    a.max.y + eps >= b.min.y &&
    a.min.z - eps <= b.max.z &&
    a.max.z + eps >= b.min.z
  );
}
