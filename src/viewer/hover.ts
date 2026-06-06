import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { resolvePart } from "./selection";
import type { SelectedPart } from "./selection";
import { getPartMeta } from "../data/metadata";

// A soft, cool glow that reads as secondary next to the orange selection
// highlight — so a selected part always stays visually stronger than a hover.
const HOVER_COLOR = Color3.FromHexString("#bcd4ff");

/**
 * Hover affordance for desktop pointers: a subtle, non-destructive highlight on
 * the part under the cursor plus a tooltip showing its name. The hovered part is
 * resolved with the same grouping as click selection (`resolvePart`), so hover
 * highlights the whole physical object rather than a single material fragment.
 *
 * Like the selection highlight it uses a HighlightLayer, so original materials
 * are never mutated. Disabled on touch-only devices and suppressed while
 * dragging/orbiting. The currently selected part is skipped so hover never
 * competes with the stronger selection glow.
 */
export class HoverManager {
  private readonly highlight: HighlightLayer;
  private readonly tooltip: HTMLElement;
  private readonly enabled: boolean;
  private observer: Observer<PointerInfo> | null = null;

  private dragging = false;
  /** Last submesh picked, so we only re-run grouping when it changes. */
  private lastPicked: AbstractMesh | null = null;
  /** Meshes currently glowing, and the id of the part they belong to. */
  private hoveredMeshes: AbstractMesh[] = [];
  private hoveredId: number | null = null;
  /** Id of the selected part, excluded from hover. */
  private selectedId: number | null = null;

  constructor(private readonly scene: Scene) {
    // Only enable where a precise hovering pointer exists (i.e. a mouse).
    this.enabled =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    this.highlight = new HighlightLayer("hover", scene, {
      blurHorizontalSize: 0.6,
      blurVerticalSize: 0.6,
    });
    this.highlight.innerGlow = false;

    this.tooltip = createTooltip();

    if (this.enabled) {
      this.observer = scene.onPointerObservable.add((info) => this.onPointer(info));
    }
  }

  /**
   * Inform the hover layer which part is currently selected, so it never
   * highlights or tooltips a part that already carries the stronger selection.
   */
  setSelected(part: SelectedPart | null): void {
    this.selectedId = part?.id ?? null;
    this.lastPicked = null; // force a fresh resolve on the next move
    if (this.hoveredId !== null && this.hoveredId === this.selectedId) this.clearHover();
  }

  private onPointer(info: PointerInfo): void {
    if (info.type === PointerEventTypes.POINTERDOWN) {
      this.dragging = true; // a drag (orbit) is starting — suppress hover
      this.clearHover();
      this.lastPicked = null;
      return;
    }
    if (info.type === PointerEventTypes.POINTERUP) {
      this.dragging = false;
      return;
    }
    if (info.type !== PointerEventTypes.POINTERMOVE) return;

    const event = info.event as PointerEvent;
    // Ignore touch/pen moves; hover is a mouse-only affordance.
    if (this.dragging || (event.pointerType && event.pointerType !== "mouse")) {
      this.clearHover();
      this.lastPicked = null;
      return;
    }

    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
    const mesh = pick?.hit ? pick.pickedMesh : null;
    if (!mesh) {
      this.clearHover();
      this.lastPicked = null;
      return;
    }

    // Same fragment as last move: nothing to recompute, just track the cursor.
    if (mesh === this.lastPicked) {
      this.moveTooltip(event);
      return;
    }
    this.lastPicked = mesh;

    const part = resolvePart(mesh);
    if (part.id === this.selectedId) {
      this.clearHover(); // don't compete with the selection highlight
      return;
    }

    if (part.id !== this.hoveredId) this.setHover(part);
    this.moveTooltip(event);
  }

  private setHover(part: SelectedPart): void {
    this.removeGlow();
    for (const mesh of part.meshes) {
      this.highlight.addMesh(mesh as Mesh, HOVER_COLOR);
    }
    this.hoveredMeshes = part.meshes;
    this.hoveredId = part.id;

    this.tooltip.textContent = getPartMeta(part.rawName).label;
    this.tooltip.hidden = false;
  }

  private clearHover(): void {
    this.removeGlow();
    this.hoveredId = null;
    this.tooltip.hidden = true;
  }

  private removeGlow(): void {
    for (const mesh of this.hoveredMeshes) {
      this.highlight.removeMesh(mesh as Mesh);
    }
    this.hoveredMeshes = [];
  }

  private moveTooltip(event: PointerEvent): void {
    this.tooltip.style.left = `${event.clientX}px`;
    this.tooltip.style.top = `${event.clientY}px`;
  }

  dispose(): void {
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
    this.highlight.dispose();
    this.tooltip.remove();
  }
}

function createTooltip(): HTMLElement {
  const el = document.createElement("div");
  el.className = "hover-tooltip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}
