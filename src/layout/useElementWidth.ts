import { useCallback, useRef, useState } from 'react';

// Sensible non-zero default so the first paint (before the ResizeObserver's first
// callback fires) is not degenerate — this matches ControlPanel's own
// DEFAULT_ROW_WIDTH fallback.
const DEFAULT_WIDTH = 320;

/**
 * Measures an arbitrary element's rendered width. Used for the controls column,
 * which — unlike the board — is not square and does not need a cell size, just
 * its own width so `ControlPanel` can scale its buttons to it.
 *
 * This is a CALLBACK ref, not a plain `useRef` + `useEffect`, for the same reason
 * `useBoardColumn` uses one: the wrapper this hook measures does not exist on
 * first mount. `App` renders the menu (and later a no-information handoff
 * screen) before the in-game screen that holds this element ever mounts, and it
 * can unmount again on route changes. A `useRef`/`useEffect([])` pair reads
 * `ref.current` once while it is still null, attaches nothing, and — because the
 * deps array is empty — never gets another chance, leaving the measurement stuck
 * at the initial value for the whole session. The callback ref fires every time
 * the node is attached or detached, so the observer (re)attaches whenever the
 * element actually exists. Do not "simplify" this back to `useRef` + `useEffect`.
 */
export function useElementWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const observerRef = useRef<ResizeObserver | null>(null);

  // useCallback keeps this function's identity stable across renders (empty deps: it
  // closes over nothing that changes). A callback ref with an unstable identity gets
  // called with `null` then the node on every render, tearing down and rebuilding the
  // observer each time — the stable identity here means React only calls it when the
  // underlying DOM node actually changes (mount, unmount, or swap).
  const ref = useCallback((el: HTMLDivElement | null) => {
    // Disconnect whatever observer was previously attached (e.g. from the element
    // that just unmounted on a route change) before attaching a new one, so route
    // changes can't leak observers or leave two attached at once.
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const next = Math.round(box.width);
      // Bail out when nothing changed: ResizeObserver fires on sub-pixel jitter
      // and an unconditional setState would re-render the whole game every tick.
      setWidth((prev) => (prev === next ? prev : next));
    });

    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return { ref, width };
}
