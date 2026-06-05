/**
 * Thin controller over the loading / error overlay markup in index.html.
 * Keeps all DOM lookups in one place so the rest of the app deals in methods.
 */
export class LoadingOverlay {
  private readonly el: HTMLElement;
  private readonly textEl: HTMLElement;

  constructor() {
    const el = document.getElementById("loadingOverlay");
    const textEl = document.getElementById("loadingText");
    if (!el || !textEl) throw new Error("Loading overlay markup not found");
    this.el = el;
    this.textEl = textEl;
  }

  /** Update progress text. Pass null when total size is unknown. */
  setProgress(percent: number | null): void {
    this.textEl.textContent =
      percent == null ? "Loading model…" : `Loading model… ${Math.round(percent)}%`;
  }

  hide(): void {
    this.el.classList.add("overlay--hidden");
  }

  /** Show a terminal error state (spinner hidden, message in red). */
  error(message: string): void {
    this.el.classList.remove("overlay--hidden");
    this.el.classList.add("overlay--error");
    this.textEl.textContent = message;
  }
}
