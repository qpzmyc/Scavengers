import { theme } from '../theme';

export function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      style={{
        width: 44,
        height: 44,
        fontSize: 22,
        lineHeight: 1,
        borderRadius: 10,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      ←
    </button>
  );
}
