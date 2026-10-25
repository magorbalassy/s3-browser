import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 's3b.theme';
const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const ICONS: Record<ThemeMode, string> = {
  system: 'brightness_auto',
  light: 'light_mode',
  dark: 'dark_mode',
};

/** Light / dark / follow-the-system, remembered per browser. */
@Injectable({
  providedIn: 'root',
})
export class Theme {
  private readonly document = inject(DOCUMENT);
  readonly mode = signal<ThemeMode>(readStored());

  constructor() {
    effect(() => {
      const mode = this.mode();
      // The Material theme uses light-dark(), so color-scheme alone switches it.
      this.document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Storage can be unavailable (private mode); the choice just isn't remembered.
      }
    });
  }

  icon(): string {
    return ICONS[this.mode()];
  }

  cycle(): void {
    this.mode.update((mode) => NEXT[mode]);
  }
}

function readStored(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Fall through to the default.
  }
  return 'system';
}
