import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { getPartMeta } from "../data/metadata";
import type { SelectedPart } from "../viewer/selection";

/**
 * Renders the selection info panel. Content is built from the selected part:
 * the display name and category come from the metadata mapping, while the
 * quantitative attributes (vertices, triangles, dimensions, material count) are
 * derived directly from the mesh data — so the panel works for any part.
 */
export class InfoPanel {
  private readonly el: HTMLElement;

  /** Invoked when the user dismisses the panel via its close button. */
  onClear: () => void = () => {};

  constructor() {
    const el = document.getElementById("infoPanel");
    if (!el) throw new Error("Info panel markup not found");
    this.el = el;
  }

  /** Show details for the selected part. */
  show(part: SelectedPart): void {
    const meta = getPartMeta(part.rawName);
    const stats = computeStats(part);

    this.el.classList.remove("panel--empty");
    this.el.replaceChildren(
      header(meta.label, this.onClear),
      badge(meta.category),
      paragraph(meta.description, "panel__desc"),
      attributes([
        ["Part ID", part.rawName],
        ["Sub-meshes", String(part.meshes.length)],
        ["Vertices", stats.vertices.toLocaleString()],
        ["Triangles", stats.triangles.toLocaleString()],
        ["Materials", String(stats.materials)],
        ["Dimensions", stats.dimensions],
      ])
    );
  }

  /** Return to the empty placeholder state. */
  clear(): void {
    this.el.classList.add("panel--empty");
    this.el.replaceChildren(placeholder());
  }
}

interface PartStats {
  vertices: number;
  triangles: number;
  materials: number;
  dimensions: string;
}

function computeStats(part: SelectedPart): PartStats {
  let vertices = 0;
  let indices = 0;
  const materialNames = new Set<string>();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of part.meshes) {
    vertices += mesh.getTotalVertices();
    indices += mesh.getTotalIndices();
    if (mesh.material) materialNames.add(mesh.material.name);
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bb.minimumWorld);
    max.maximizeInPlace(bb.maximumWorld);
  }

  const size = max.subtract(min);
  const fmt = (n: number) => (isFinite(n) ? n.toFixed(2) : "0");
  return {
    vertices,
    triangles: Math.round(indices / 3),
    materials: materialNames.size,
    dimensions: `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}`,
  };
}

// ---------- small DOM builders (textContent everywhere, so no injection) ----------

function header(name: string, onClear: () => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "panel__header";

  const h2 = document.createElement("h2");
  h2.className = "panel__name";
  h2.textContent = name;

  const close = document.createElement("button");
  close.className = "panel__close";
  close.type = "button";
  close.setAttribute("aria-label", "Clear selection");
  close.textContent = "×";
  close.addEventListener("click", onClear);

  wrap.append(h2, close);
  return wrap;
}

function badge(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "panel__category";
  span.textContent = text;
  return span;
}

function paragraph(text: string, className: string): HTMLElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function attributes(rows: Array<[string, string]>): HTMLElement {
  const dl = document.createElement("dl");
  dl.className = "attr-list";
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

function placeholder(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "panel__placeholder";
  wrap.append(
    paragraph("Click a part to inspect it.", "panel__hint"),
    paragraph("Drag to rotate · scroll / pinch to zoom", "panel__sub")
  );
  return wrap;
}
