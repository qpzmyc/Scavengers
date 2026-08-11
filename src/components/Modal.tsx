import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { theme } from '../theme';

// How long the exit animation runs, matching modalScrimOut / modalPanelOut in
// src/index.css. Change both together or the modal is cut off mid-exit (too
// short) or hangs around invisible, still covering the screen (too long).
const EXIT_MS = 180;

// Everything inside the panel that can take focus. Used both to pick where focus
// lands on open and to find the two ends of the Tab cycle.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // An exit animation can only be seen if the thing playing it is still on
  // screen, and every caller drops this component the instant onClose fires. So
  // the modal owns its own goodbye: a close request plays the exit here first
  // and only then tells the caller, which keeps all five call sites unchanged.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Whatever had focus when this modal was opened, so focus can be handed back
  // on close. Captured in a state initializer, which runs during the first
  // render, because by the time an effect runs React has already applied any
  // `autoFocus` inside the panel (TextInputPopup has one) and the answer would
  // be the modal's own input rather than the control that opened it.
  const [opener] = useState<HTMLElement | null>(() => document.activeElement as HTMLElement | null);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    // A second click while the modal is already leaving would queue a second
    // onClose. Harmless for a popup, but not for ConfirmDialog, whose onClose
    // runs a real action.
    if (exitTimer.current !== null) return;
    setClosing(true);
    exitTimer.current = window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Move focus into the panel on open and hand it back to the opener on close,
  // so keyboard focus never ends up stranded on an element that is no longer on
  // screen. A text input wins the initial focus where there is one (Rename,
  // Create Room) because the whole point of those popups is typing; otherwise
  // the panel itself takes it, which lets a screen reader announce the title
  // before the first Tab.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const input = panel.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])');
    (input ?? panel).focus();
    // An opener that has since been unmounted (quitting to the menu closes the
    // dialog and the screen behind it at once) can't take focus back, and
    // focusing a detached node would silently drop focus onto <body>.
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  // Escape closes, and Tab is confined to the panel. Without the cycle, tabbing
  // walks out of the modal and onto the page behind it, which is still visible
  // through the scrim but not meant to be reachable while a popup is up.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (stops.length === 0) {
      // Nothing to tab between, so the panel keeps focus rather than losing it
      // to the page behind.
      e.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    // The panel itself is focusable but not in `stops`, so a Tab from the panel
    // has to be steered explicitly or the browser would move past the modal.
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      onClick={requestClose}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.scrim,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: closing
          ? `modalScrimOut ${EXIT_MS}ms var(--ease-exit) forwards`
          : 'modalScrimIn 200ms var(--ease-enter) backwards',
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Focusable only programmatically: it takes the initial focus when the
        // panel has no input, but never becomes a Tab stop of its own.
        tabIndex={-1}
        style={{
          outline: 'none',
          position: 'relative',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          boxShadow: theme.shadow,
          padding: 'var(--modal-pad, 32px)',
          minWidth: 'min(360px, calc(100vw - 32px))',
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          // Rises further and over longer than the scrim fades, so the panel is
          // still arriving once the background has finished dimming. Reversing
          // that reads as the panel being late.
          animation: closing
            ? `modalPanelOut ${EXIT_MS}ms var(--ease-exit) forwards`
            : 'modalPanelIn 260ms var(--ease-enter) backwards',
        }}
      >
        <button
          onClick={requestClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            fontSize: 20,
            lineHeight: 1,
            borderRadius: 8,
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
        <h2 style={{ fontSize: 22, margin: 0, color: theme.heading }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
