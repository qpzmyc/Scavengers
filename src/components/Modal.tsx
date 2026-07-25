import type { ReactNode } from 'react';
import { theme } from '../theme';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.scrim,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
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
        }}
      >
        <button
          onClick={onClose}
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
