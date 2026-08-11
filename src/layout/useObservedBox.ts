import { useCallback, useRef } from 'react';

/**
 * Attaches a ResizeObserver to whichever element the returned ref lands on, and
 * hands its content box to `onBox` on every resize. The shared half of
 * `useBoardColumn` and `useElementWidth`, which differ only in what they derive
 * from the box.
 *
 * `onBox` MUST be identity-stable, meaning a `useCallback` with an empty
 * dependency list. It is a dependency of the returned callback ref, and an
 * unstable one rebuilds the observer on every render, which is the exact cost
 * the `useCallback` below exists to avoid.
 *
 * This returns a CALLBACK ref, not a `useRef` for a caller to pair with a
 * `useEffect`. The elements measured here do not exist on first mount: `App`
 * renders the menu (and later a no-information handoff screen) before the
 * in-game screen that holds them ever mounts, and they can unmount again on
 * route changes. A `useRef`/`useEffect([])` pair reads `ref.current` once while
 * it is still null, attaches nothing, and, because the deps array is empty,
 * never gets another chance, leaving the measurement stuck at its initial value
 * for the whole session. A callback ref fires every time the node is attached or
 * detached, so the observer (re)attaches whenever the element actually exists.
 * Do not "simplify" this back to `useRef` + `useEffect`.
 */
export function useObservedBox(onBox: (box: DOMRectReadOnly) => void) {
  const observerRef = useRef<ResizeObserver | null>(null);

  return useCallback(
    (el: HTMLDivElement | null) => {
      // Disconnect whatever observer was previously attached (e.g. from the
      // element that just unmounted on a route change) before attaching a new
      // one, so route changes can't leak observers or leave two attached at once.
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (box) onBox(box);
      });

      observer.observe(el);
      observerRef.current = observer;
    },
    [onBox],
  );
}
