const STORAGE_KEY = 'scavengers.playerName';

// Persisted across rooms/sessions so a chosen name auto-applies to every room joined.
export function getSavedPlayerName(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setSavedPlayerName(name: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Storage unavailable (e.g. private browsing) — the name simply won't persist.
  }
}
