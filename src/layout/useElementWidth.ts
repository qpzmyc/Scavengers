import { useCallback, useState } from 'react';
import { useObservedBox } from './useObservedBox';

// Sensible non-zero default so the first paint (before the ResizeObserver's first
// callback fires) is not degenerate — this matches ControlPanel's own
// DEFAULT_ROW_WIDTH fallback.
const DEFAULT_WIDTH = 320;

/**
 * Measures an arbitrary element's rendered width. Used for the controls column,
 * which — unlike the board — is not square and does not need a cell size, just
 * its own width so `ControlPanel` can scale its buttons to it.
 *
 * The observer plumbing, and why it has to be a callback ref, lives in
 * `useObservedBox`.
 */
export function useElementWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  // Empty deps, so this stays identity-stable: `useObservedBox` requires it, and
  // an unstable callback rebuilds the ResizeObserver on every render.
  const onBox = useCallback((box: DOMRectReadOnly) => {
    const next = Math.round(box.width);
    // Bail out when nothing changed: ResizeObserver fires on sub-pixel jitter
    // and an unconditional setState would re-render the whole game every tick.
    setWidth((prev) => (prev === next ? prev : next));
  }, []);

  return { ref: useObservedBox(onBox), width };
}
