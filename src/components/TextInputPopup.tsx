import { useState } from 'react';
import { Modal } from './Modal';
import { theme } from '../theme';

export function TextInputPopup({
  title,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  maxLength,
  onConfirm,
  onClose,
}: {
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    if (value.trim()) onConfirm(value.trim());
  };
  return (
    <Modal title={title} onClose={onClose}>
      <input
        autoFocus
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 16px',
          fontSize: 18,
          borderRadius: 8,
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          color: theme.text,
          textAlign: 'center',
          letterSpacing: 2,
        }}
      />
      <button
        onClick={submit}
        style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 700,
          background: theme.accent,
          border: `1px solid ${theme.accent}`,
          color: '#fff',
          borderRadius: 10,
          cursor: 'pointer',
        }}
      >
        {confirmLabel}
      </button>
    </Modal>
  );
}
