import type { PartMatch } from "../viewer/selection";

export interface SearchBoxOptions {
  /** The search text input. */
  input: HTMLInputElement;
  /** The `<ul>` that holds the results dropdown. */
  results: HTMLElement;
  /** Returns the parts matching the current query. */
  find: (query: string) => PartMatch[];
  /** Called when the user commits a result (click or Enter). */
  onPick: (match: PartMatch) => void;
}

/**
 * Autocomplete-style search box. As the user types it shows a dropdown of
 * matching parts; selection only happens when a result is chosen (click,
 * tap, or Enter) — it never auto-selects the first match while typing.
 * Supports ArrowUp/Down navigation and Escape to close.
 */
export class SearchBox {
  private matches: PartMatch[] = [];
  private active = -1;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly opts: SearchBoxOptions) {
    const { input, results } = opts;

    const onInput = () => this.refresh();
    const onKey = (e: KeyboardEvent) => this.onKeyDown(e);
    const onFocus = () => {
      if (input.value.trim()) this.refresh();
    };
    // Close when clicking/tapping outside the input or its dropdown.
    const onDocPointer = (e: Event) => {
      const target = e.target as Node;
      if (!input.contains(target) && !results.contains(target)) this.close();
    };

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    input.addEventListener("focus", onFocus);
    document.addEventListener("pointerdown", onDocPointer);

    this.cleanups.push(
      () => input.removeEventListener("input", onInput),
      () => input.removeEventListener("keydown", onKey),
      () => input.removeEventListener("focus", onFocus),
      () => document.removeEventListener("pointerdown", onDocPointer)
    );
  }

  private refresh(): void {
    this.matches = this.opts.find(this.opts.input.value);
    this.active = -1;
    this.render();
  }

  private render(): void {
    const { results, input } = this.opts;
    results.replaceChildren();

    if (this.matches.length === 0) {
      this.close();
      return;
    }

    this.matches.forEach((match, i) => {
      const li = document.createElement("li");
      li.className = "search-results__item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === this.active));
      if (i === this.active) li.classList.add("is-active");

      const label = document.createElement("span");
      label.className = "search-results__label";
      label.textContent = match.label;

      const cat = document.createElement("span");
      cat.className = "search-results__cat";
      cat.textContent = match.category;

      li.append(label, cat);
      // Use pointerdown so the pick fires before the input loses focus.
      li.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.pick(i);
      });
      results.append(li);
    });

    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.matches.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.active = (this.active + 1) % this.matches.length;
        this.render();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.active = (this.active - 1 + this.matches.length) % this.matches.length;
        this.render();
        break;
      case "Enter":
        e.preventDefault();
        this.pick(this.active >= 0 ? this.active : 0);
        break;
      case "Escape":
        e.preventDefault();
        this.close();
        break;
    }
  }

  private pick(index: number): void {
    const match = this.matches[index];
    if (!match) return;
    this.opts.onPick(match);
    this.opts.input.value = match.label;
    this.close();
  }

  private close(): void {
    this.opts.results.hidden = true;
    this.opts.results.replaceChildren();
    this.opts.input.setAttribute("aria-expanded", "false");
    this.active = -1;
  }

  dispose(): void {
    for (const off of this.cleanups) off();
    this.close();
  }
}
