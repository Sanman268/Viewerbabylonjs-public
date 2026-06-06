import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";

/** Static, model-derived figures that don't change frame to frame. */
export interface ModelStats {
  variant?: string;
  totalTriangles?: number;
}

const UPDATE_INTERVAL_MS = 500;

/**
 * Compact, toggleable performance overlay. It only samples the engine/scene on a
 * timer while visible (every 500ms) — never per frame — so it stays cheap. FPS
 * and mesh counts are read live; triangle count and model variant come from the
 * caller once the model has loaded.
 */
export class StatsOverlay {
  private readonly el: HTMLElement;
  private timer: ReturnType<typeof setInterval> | null = null;
  private model: ModelStats = {};

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene
  ) {
    this.el = document.createElement("div");
    this.el.className = "stats";
    this.el.setAttribute("aria-live", "off");
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  /** Provide model-derived figures (called once the model is ready). */
  setModelStats(stats: ModelStats): void {
    this.model = { ...this.model, ...stats };
    if (!this.el.hidden) this.update();
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Toggle visibility; returns the new visible state. */
  toggle(): boolean {
    if (this.el.hidden) this.show();
    else this.hide();
    return this.visible;
  }

  show(): void {
    if (!this.el.hidden) return;
    this.el.hidden = false;
    this.update();
    this.timer = setInterval(() => this.update(), UPDATE_INTERVAL_MS);
  }

  hide(): void {
    this.el.hidden = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private update(): void {
    const rows: Array<[string, string]> = [
      ["FPS", this.engine.getFps().toFixed(0)],
      ["Meshes", String(this.scene.meshes.length)],
      ["Active", String(this.scene.getActiveMeshes().length)],
    ];
    if (this.model.totalTriangles !== undefined) {
      rows.push(["Triangles", this.model.totalTriangles.toLocaleString()]);
    }
    if (this.model.variant) {
      rows.push(["Variant", this.model.variant]);
    }
    this.render(rows);
  }

  private render(rows: Array<[string, string]>): void {
    this.el.replaceChildren(
      ...rows.map(([key, value]) => {
        const row = document.createElement("div");
        row.className = "stats__row";
        const k = document.createElement("span");
        k.className = "stats__key";
        k.textContent = key;
        const v = document.createElement("span");
        v.className = "stats__val";
        v.textContent = value;
        row.append(k, v);
        return row;
      })
    );
  }

  dispose(): void {
    this.hide();
    this.el.remove();
  }
}
