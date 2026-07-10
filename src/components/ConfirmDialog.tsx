import { Modal } from './Modal';
import { theme } from '../theme';

// A yes/no confirmation built on the shared Modal. The backdrop × and Cancel both
// dismiss without confirming; Confirm invokes onConfirm.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = '#c0392b',
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      {message && <div style={{ color: theme.textMuted, fontSize: 15, textAlign: 'center' }}>{message}</div>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '12px 26px',
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 10,
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            cursor: 'pointer',
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: '12px 26px',
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 10,
            background: confirmColor,
            border: `1px solid ${confirmColor}`,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
